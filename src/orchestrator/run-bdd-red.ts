import { bddRedContext } from "../agents/context/task-context.js";
import { BDD_RED, profileFor } from "../agents/profiles.js";
import { bddRedPrompt } from "../agents/prompts/bdd-red.js";
import { NEWLINE } from "../artifacts/lines.js";
import { checkpoint } from "../artifacts/git-checkpoints.js";
import { headCommit } from "../artifacts/git-workspace.js";
import { advanceStep, CYCLE_STEP, loadProgress, recordScenario, SCENARIO_STATUS } from "../artifacts/progress.js";
import { loadProjectConfig } from "../artifacts/project-config.js";
import { clearReturn } from "../artifacts/return-record.js";
import { OUTCOME } from "../artifacts/red-classification.js";
import { listLocatedScenarios, readFeatureSources } from "../artifacts/traceability.js";
import { ERROR_EVENT } from "../events/types.js";
import { runBillable } from "./budget-call.js";
import { bddRedGate, type CurrentScenario, GUARD, PROBLEM } from "./bdd-red-gate.js";
import { askAboutGuard } from "./guard-question.js";
import { guardSteps } from "./guard-steps.js";
import { AFTER_GUARD, acceptGuard } from "./run-guard.js";
import { TryAgain } from "./redirect.js";
import { isExitCode, type Started, STATE, transition } from "./begin.js";
import { agentStop, attemptsOf, attemptTask } from "./state-attempts.js";
import { decideRed, VALID_RED } from "./red-decision.js";
import { rewrittenStepsGate } from "./rewritten-steps-gate.js";
import { readSession, updateSession } from "./session.js";
import { type FeatureServices, runnersOf } from "./services.js";
import { updateFeature } from "./worktree-progress.js";
import { unfinishedScenarios } from "./wip-tag.js";

/** The first scenario of the requirement in file order that does not pass yet, with the names of all its scenarios; none when all pass. A name that two scenarios share is a problem. */
function currentScenario(worktree: string, fr: string): { current: CurrentScenario; names: string[] } | { problem: string } | undefined {
  const { paths } = loadProjectConfig(worktree);
  const own = listLocatedScenarios(readFeatureSources(worktree, paths.bdd_features)).filter(({ tags }) => tags.includes(`@${fr}`));
  const names = own.map(({ name }) => name);
  const twice = names.find((name, at) => names.indexOf(name) !== at);
  if (twice !== undefined) return { problem: `${fr}: the scenario "${twice}" is defined twice, and scenarios are told apart by their names` };
  const passing = loadProgress(worktree, paths.progress).features.find(({ id }) => id === fr)?.scenarios?.filter(({ bdd }) => bdd === SCENARIO_STATUS.pass).map(({ name }) => name) ?? [];
  const [first] = unfinishedScenarios(own, fr, passing);
  return first === undefined ? undefined : { current: { file: first.file, line: first.line, name: first.name }, names };
}

/** Moves the requirement to TDD Red in the progress file of the worktree, recording its scenarios: the current one as failing, the others as pending unless they are known. */
function recordRed(worktree: string, fr: string, scenarios: { current: string; names: string[] }): void {
  updateFeature(worktree, fr, (feature) => {
    const known = feature.scenarios ?? [];
    const registered = scenarios.names.filter((name) => !known.some((scenario) => scenario.name === name)).reduce((moved, name) => recordScenario(moved, name, SCENARIO_STATUS.pending), advanceStep(feature, CYCLE_STEP.tddRed));
    return recordScenario(registered, scenarios.current, SCENARIO_STATUS.fail);
  });
}

/** Ends the run with an error that names `message`: returns the exit code of the process. */
export function fail({ bus }: Started, message: string): number {
  return bus.emit({ type: ERROR_EVENT, message }) ?? 1;
}

/** A scenario whose steps fail validly: the scenario, how to name it in a message, and the failure the runner showed. */
export type RedScenario = { current: CurrentScenario; label: string; failure: string };

/** The person asked for the steps of the scenario to be written again: what they said, the failure the scenario showed, and the commit the scenario started from when code was written for it since (the steps must then pass with that code and fail without it). */
export type StepsRewrite = { note: string; failure: string; base?: string };

/** What the step writer is told when its steps are written again: why, what the scenario showed, and whether code for it exists. */
function rewriteContext({ note, failure, base }: StepsRewrite): string {
  return [
    "The person who follows the run asked for these steps to be written again: the steps that exist did not lead to a working feature, and fixing them now saves everybody the time of a longer detour later.",
    note === "" ? "They gave no note." : `They say: ${note}`,
    base === undefined
      ? "No code exists for this scenario yet: write steps that fail because the feature is missing, as for a new scenario."
      : "Code for this scenario already exists and stays as it is. Write steps that pass with that code and would fail without it: oid runs the scenario with the code and again with the code taken out, and rejects steps that pass in both runs. You may not change the source code.",
    `The scenario last showed this:${NEWLINE}${failure}`,
  ].join(NEWLINE);
}

const ACCEPTED_GUARD = "accepted_guard";

/** A scenario that passes before any code and that the person accepted as a guard, with their reason. */
type AcceptedGuard = { kind: typeof ACCEPTED_GUARD; reason: string };

/** What BDD Red hands on when the scenario is a guard: the run goes on with the next scenario or, with none left, with the quality gate. */
export type GuardAccepted = { guardAccepted: (typeof AFTER_GUARD)[keyof typeof AFTER_GUARD] };

/** Puts a scenario that passes before any code to the person, with the step definitions the agent wrote: returns the guard they accept, or the exit code of the process; a retry with a note throws `TryAgain`. */
async function askAboutPassingScenario(started: Started, services: FeatureServices, label: string): Promise<number | AcceptedGuard> {
  const steps = guardSteps(started.workspace.path, readSession(started.cwd)?.scenarioStart ?? headCommit(started.workspace.path));
  const answer = await askAboutGuard(started.bus, services.input ?? { isTTY: false }, { label, steps });
  if (isExitCode(answer)) return answer;
  if ("note" in answer) throw new TryAgain(answer.note);
  return { kind: ACCEPTED_GUARD, reason: answer.guard };
}

/** Runs BDD Red for the first scenario of the first target that does not pass: the agent writes its steps, the gate judges them and a valid Red is checkpointed. Returns the scenario that failed validly, or the exit code of the process. With `rewrite`, the steps are written again for a scenario the run already worked on: the scenario's start and iteration are kept, and when code exists for it the gate judges the steps with and without that code and the run does not go on to TDD Red. */
export async function runBddRed(started: Started, services: FeatureServices, featureHashes: Record<string, string>, rewrite?: StepsRewrite): Promise<number | RedScenario | GuardAccepted> {
  const { cwd, bus, workspace, targets } = started;
  const [fr] = targets;
  const found = currentScenario(workspace.path, fr!);
  if (found === undefined) return fail(started, `${fr}: no scenario is tagged with it`);
  if ("problem" in found) return fail(started, found.problem);
  const { current, names } = found;
  const label = `${fr} "${current.name}"`;
  updateSession(cwd, { fr, scenario: { index: names.indexOf(current.name), name: current.name, location: `${current.file}:${current.line}` }, ...(rewrite === undefined ? { innerIteration: 1, scenarioStart: headCommit(workspace.path) } : {}) });
  const context = `${bddRedContext(workspace.path, current)}${rewrite === undefined ? "" : `${NEWLINE}${NEWLINE}${rewriteContext(rewrite)}`}`;
  const profile = profileFor(BDD_RED, loadProjectConfig(workspace.path));
  const prompt = `${bddRedPrompt(fr!, `${current.file}:${current.line}`, profile)}${NEWLINE}${NEWLINE}${context}`;
  const gate = await attemptsOf(started, services, {
    state: BDD_RED,
    role: "bdd-agent",
    label,
    run: async (info) => {
      const outcome = await runBillable(started, services, attemptTask(BDD_RED, prompt, info), { fr: fr!, announce: info.announce });
      const stopped = agentStop(started, label, outcome);
      if (stopped !== undefined) return stopped;
      const judged = rewrite?.base === undefined ? bddRedGate(workspace.path, current, featureHashes, runnersOf(services)) : rewrittenStepsGate(workspace.path, current, featureHashes, rewrite.base, runnersOf(services));
      if (judged.kind === PROBLEM) return { rejected: `${label}: ${judged.problem}` };
      if (judged.kind === GUARD) return askAboutPassingScenario(started, services, label);
      if (judged.kind !== OUTCOME.decision) return judged;
      const decided = await decideRed(bus, services.input ?? { isTTY: false }, { label, reason: judged.reason, message: judged.message, detail: judged.detail, step: judged.step });
      return decided === VALID_RED ? judged : decided;
    },
  });
  if (isExitCode(gate)) return gate;
  if (gate.kind === ACCEPTED_GUARD) return { guardAccepted: acceptGuard(started, { name: current.name, names, reason: gate.reason }) };
  clearReturn(workspace.path, fr!);
  if (rewrite?.base !== undefined) {
    updateFeature(workspace.path, fr!, (feature) => advanceStep(feature, CYCLE_STEP.tddGreen, [CYCLE_STEP.tddGreen]));
    checkpoint(workspace, { fr: fr!, state: STATE.bddRed, scenario: current.name });
    return { current, label, failure: rewrite.failure };
  }
  recordRed(workspace.path, fr!, { current: current.name, names });
  checkpoint(workspace, { fr: fr!, state: STATE.bddRed, scenario: current.name });
  updateSession(cwd, { state: STATE.tddRed, scenarioFailure: gate.message });
  transition(bus, STATE.bddRed, STATE.tddRed, `the scenario "${current.name}" fails validly: ${gate.kind === OUTCOME.valid ? gate.reason : "the person decided that it is a valid Red"}`);
  return { current, label, failure: gate.message };
}
