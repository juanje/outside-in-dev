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
import { agentContext, outcomeProblem } from "./agent-run.js";
import { type Started, STATE, transition } from "./begin.js";
import { autofix } from "./gate-autofix.js";
import { gateChecks, type GateOutcome, OUTCOME } from "./gate-checks.js";
import { type GateAsk, gateQuestion } from "./gate-question.js";
import { fixGroups } from "./fix-owners.js";
import { qualityFixContext, errorLine } from "./quality-fix-context.js";
import type { FeatureServices } from "./services.js";
import { runGateBaseline, updateSession } from "./session.js";

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

/** Has the agent that owns each kind of file fix its errors, one agent after the other, each judged by the integrity rules of its step and checkpointed. Returns the reason the fix is rejected, after rolling the worktree back to where it was; nothing when every file is fixed. */
async function qualityFix(started: Started, services: FeatureServices, config: ProjectConfig, errors: GateError[]): Promise<string | undefined> {
  const { workspace, targets } = started;
  const [fr] = targets;
  const worktree = workspace.path;
  const { groups, unowned } = fixGroups(errors, config.paths);
  if (unowned.length > 0) return `no agent owns ${[...new Set(unowned.map(({ file }) => file === "" ? "the project" : file))].join(LIST_SEPARATOR)}`;
  const before = headCommit(worktree);
  for (const { owner, state, step, errors: owned } of groups) {
    const prompt = `${qualityFixPrompt(fr!, owner)}${NEWLINE}${NEWLINE}${qualityFixContext(worktree, owned)}`;
    const problem = outcomeProblem(fr!, await runAgent({ state, prompt }, agentContext(started, services)));
    const forbidden = problem === undefined ? integrityProblems(worktree, config, loadProgress(worktree, config.paths.progress), step) : [];
    if (problem !== undefined || forbidden.length > 0) {
      rollback(workspace, before, [...config.paths.source, ...config.paths.unit_tests, ...config.paths.bdd_steps]);
      return problem ?? forbidden.join(NEWLINE);
    }
    checkpoint(workspace, { fr: fr!, state: STATE.qualityFix });
  }
  return undefined;
}

/** Has the errors of a check fixed once: returns whether the fix was accepted, and the question to put to the person when it was not. */
async function fixOnce(started: Started, services: FeatureServices, config: ProjectConfig, outcome: Extract<GateOutcome, { kind: typeof OUTCOME.fix }>): Promise<GateAsk | undefined> {
  const { cwd, bus } = started;
  updateSession(cwd, { state: STATE.qualityFix });
  transition(bus, STATE.qualityGate, STATE.qualityFix, `${describeErrors(outcome.errors)}: the agents that own the files fix them`);
  const rejected = await qualityFix(started, services, config, outcome.errors);
  updateSession(cwd, { state: STATE.qualityGate });
  if (rejected !== undefined) {
    transition(bus, STATE.qualityFix, STATE.qualityGate, `the fix is rejected: ${rejected}`);
    return questionFor(outcome.errors, outcome.output, rejected);
  }
  transition(bus, STATE.qualityFix, STATE.qualityGate, "the errors are fixed; the checks run again");
  return undefined;
}

/** Runs the quality gate of the feature: the project's fixes, then its checks; errors of the linter or the type check go once to the agents that own the files. Ends at the commit of the feature: returns the exit code of the process. */
export async function runQualityGate(started: Started, services: FeatureServices): Promise<number> {
  const { cwd, runId, bus, workspace, targets } = started;
  const [fr] = targets;
  const config = loadProjectConfig(workspace.path);
  let fixed = false;
  for (;;) {
    autofix(workspace.path, config);
    checkpoint(workspace, { fr: fr!, state: STATE.qualityGate, scenario: AUTOFIX });
    const outcome = gateChecks(workspace.path, config, runGateBaseline(cwd, runId));
    if (outcome.kind === OUTCOME.internal) return bus.emit({ type: ERROR_EVENT, message: `${fr}: the quality gate: ${outcome.problem}` }) ?? 1;
    if (outcome.kind === OUTCOME.ask) return gateQuestion(bus, services.input ?? { isTTY: false }, outcome);
    if (outcome.kind === OUTCOME.fix) {
      const ask = fixed ? questionFor(outcome.errors, outcome.output) : await fixOnce(started, services, config, outcome);
      if (ask !== undefined) return gateQuestion(bus, services.input ?? { isTTY: false }, ask);
      fixed = true;
      continue;
    }
    checkpoint(workspace, { fr: fr!, state: STATE.qualityGate, allowEmpty: true });
    updateSession(cwd, { state: STATE.frCommit });
    transition(bus, STATE.qualityGate, STATE.frCommit, `every check of the quality gate passes for ${fr}; its commit is next`);
    return 0;
  }
}
