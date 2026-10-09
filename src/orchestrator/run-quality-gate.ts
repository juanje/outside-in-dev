import { runAgent } from "../agents/runner.js";
import { qualityFixPrompt } from "../agents/prompts/quality-fix.js";
import { checkpoint, rollback } from "../artifacts/git-checkpoints.js";
import { headCommit } from "../artifacts/git-workspace.js";
import { ERROR_KIND, type GateError } from "../artifacts/lint-tools.js";
import { NEWLINE } from "../artifacts/lines.js";
import { loadProgress } from "../artifacts/progress.js";
import { loadProjectConfig, type ProjectConfig } from "../artifacts/project-config.js";
import { integrityProblems } from "../commands/verify-integrity.js";
import { ERROR_EVENT } from "../events/types.js";
import { agentContext, outcomeStop } from "./agent-run.js";
import { type AttemptInfo, isRejection, type Rejection, runAttempts } from "./attempts.js";
import { type Started, STATE, transition } from "./begin.js";
import { autofix } from "./gate-autofix.js";
import { gateChecks, type GateOutcome, OUTCOME } from "./gate-checks.js";
import { type GateAsk, gateQuestion } from "./gate-question.js";
import { fixGroups } from "./fix-owners.js";
import { qualityFixContext, errorLine } from "./quality-fix-context.js";
import { type FeatureServices, runnersOf } from "./services.js";
import { runGateBaseline, updateSession } from "./session.js";
import { attemptSpec, attemptTask } from "./state-attempts.js";

const AUTOFIX = "autofix";
const LIST_SEPARATOR = " and ";

/** The errors as a count for each kind, as a sentence: "1 lint error and 2 type errors". */
function describeErrors(errors: GateError[]): string {
  const counts = new Map<string, number>();
  for (const { kind } of errors) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  return [...counts].map(([kind, count]) => `${count} ${kind} ${count === 1 ? ERROR_EVENT : `${ERROR_EVENT}s`}`).join(LIST_SEPARATOR);
}

/** The failed check as a question for the person: errors that no agent fixed, with the line of each and everything the tool printed. */
function questionFor(errors: GateError[], output: string, reason?: string): GateAsk {
  return { check: errors[0]?.kind === ERROR_KIND.type ? "types" : ERROR_KIND.lint, problems: [...(reason === undefined ? [] : [reason]), ...errors.map(errorLine)], output };
}

/** The errors of a check that an agent is asked to fix. */
type FixOutcome = Extract<GateOutcome, { kind: typeof OUTCOME.fix }>;

/** How a fix ended when it was not accepted: no agent can fix it (it ends the attempts), or the agents' work was rejected (it is retried). */
type FixStop = { stop: string };

/** Has the agent that owns each kind of file fix its errors, one agent after the other, each judged by the integrity rules of its step and checkpointed. Returns why the fix is rejected, after rolling the worktree back to where it was, or why no agent can fix it; nothing when every file is fixed. */
async function qualityFix(started: Started, services: FeatureServices, config: ProjectConfig, errors: GateError[], info: AttemptInfo): Promise<Rejection | FixStop | undefined> {
  const { workspace, targets } = started;
  const [fr] = targets;
  const worktree = workspace.path;
  const { groups, unowned } = fixGroups(errors, config.paths);
  if (unowned.length > 0) return { stop: `no agent owns ${[...new Set(unowned.map(({ file }) => file === "" ? "the project" : file))].join(LIST_SEPARATOR)}` };
  const before = headCommit(worktree);
  for (const { owner, state, step, errors: owned } of groups) {
    const prompt = `${qualityFixPrompt(fr!, owner)}${NEWLINE}${NEWLINE}${qualityFixContext(worktree, owned)}`;
    const outcome = await runAgent(attemptTask(state, prompt, info), agentContext(started, services));
    const stopped = outcomeStop(fr!, outcome);
    const forbidden = stopped === undefined ? integrityProblems(worktree, config, loadProgress(worktree, config.paths.progress), step) : [];
    if (stopped !== undefined || forbidden.length > 0) {
      rollback(workspace, before, [...config.paths.source, ...config.paths.unit_tests, ...config.paths.bdd_steps]);
      return stopped ?? { rejected: forbidden.join(NEWLINE) };
    }
    checkpoint(workspace, { fr: fr!, state: STATE.qualityFix });
  }
  return undefined;
}

/** What the attempts to fix the errors of a check came to: the checks after the accepted fix, or the question for the person when the retries ran out or no agent can fix them. */
type Fixed = { checked: GateOutcome } | { ask: GateAsk };

/** Has the errors of a check fixed, retrying a fix that is rejected, or that leaves errors after the checks run again, from the last checkpoint. The checks that run after an accepted fix are the ones the gate goes on with. */
async function fixWithRetries(started: Started, services: FeatureServices, config: ProjectConfig, outcome: FixOutcome, check: () => GateOutcome): Promise<Fixed> {
  const { cwd, bus } = started;
  updateSession(cwd, { state: STATE.qualityFix });
  transition(bus, STATE.qualityGate, STATE.qualityFix, `${describeErrors(outcome.errors)}: the agents that own the files fix them`);
  let asked: GateAsk | undefined;
  let leftErrors = false;
  const result = await runAttempts<GateOutcome | FixStop>({
    ...attemptSpec<GateOutcome | FixStop>(started, { state: STATE.qualityFix, role: "fix-agent", run: async (info) => {
      const fix = await qualityFix(started, services, config, outcome.errors, info);
      leftErrors = false;
      if (fix !== undefined) {
        if (isRejection(fix)) asked = questionFor(outcome.errors, outcome.output, fix.rejected);
        return fix;
      }
      const checked = check();
      if (checked.kind !== OUTCOME.fix) return checked;
      leftErrors = true;
      asked = questionFor(checked.errors, checked.output);
      return { rejected: describeErrors(checked.errors) };
    } }),
  });
  updateSession(cwd, { state: STATE.qualityGate });
  if ("stop" in result) {
    transition(bus, STATE.qualityFix, STATE.qualityGate, `the fix is rejected: ${result.stop}`);
    return { ask: questionFor(outcome.errors, outcome.output, result.stop) };
  }
  if (isRejection(result)) {
    transition(bus, STATE.qualityFix, STATE.qualityGate, leftErrors ? "the errors are fixed; the checks run again" : `the fix is rejected: ${result.rejected}`);
    return { ask: asked! };
  }
  transition(bus, STATE.qualityFix, STATE.qualityGate, "the errors are fixed; the checks run again");
  return { checked: result };
}

/** Runs the quality gate of the feature: the project's fixes, then its checks; errors of the linter or the type check go to the agents that own the files, which are retried up to the project's retries. Returns the exit code of the process when the run ends there, nothing when every check passes and the commit of the feature is next. */
export async function runQualityGate(started: Started, services: FeatureServices): Promise<number | undefined> {
  const { cwd, runId, bus, workspace, targets } = started;
  const [fr] = targets;
  const config = loadProjectConfig(workspace.path);
  const check = (): GateOutcome => {
    autofix(workspace.path, config, runnersOf(services));
    checkpoint(workspace, { fr: fr!, state: STATE.qualityGate, scenario: AUTOFIX });
    return gateChecks(workspace.path, config, runGateBaseline(cwd, runId), runnersOf(services));
  };
  let outcome = check();
  for (;;) {
    if (outcome.kind === OUTCOME.internal) return bus.emit({ type: ERROR_EVENT, message: `${fr}: the quality gate: ${outcome.problem}` }) ?? 1;
    if (outcome.kind === OUTCOME.ask) return gateQuestion(bus, services.input ?? { isTTY: false }, outcome);
    if (outcome.kind === OUTCOME.fix) {
      const fixed = await fixWithRetries(started, services, config, outcome, check);
      if ("ask" in fixed) return gateQuestion(bus, services.input ?? { isTTY: false }, fixed.ask);
      outcome = fixed.checked;
      continue;
    }
    checkpoint(workspace, { fr: fr!, state: STATE.qualityGate, allowEmpty: true });
    updateSession(cwd, { state: STATE.frCommit });
    transition(bus, STATE.qualityGate, STATE.frCommit, `every check of the quality gate passes for ${fr}; its commit is next`);
    return undefined;
  }
}
