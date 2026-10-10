import { bddRedContext } from "../agents/context/task-context.js";
import { BDD_RED } from "../agents/profiles.js";
import { bddRedPrompt } from "../agents/prompts/bdd-red.js";
import { NEWLINE } from "../artifacts/lines.js";
import { checkpoint } from "../artifacts/git-checkpoints.js";
import { advanceStep, CYCLE_STEP, loadProgress, recordScenario, SCENARIO_STATUS } from "../artifacts/progress.js";
import { loadProjectConfig } from "../artifacts/project-config.js";
import { OUTCOME } from "../artifacts/red-classification.js";
import { listLocatedScenarios, readFeatureSources } from "../artifacts/traceability.js";
import { ERROR_EVENT } from "../events/types.js";
import { runBillable } from "./budget-call.js";
import { bddRedGate, type CurrentScenario, PROBLEM } from "./bdd-red-gate.js";
import { isExitCode, type Started, STATE, transition } from "./begin.js";
import { agentStop, attemptsOf, attemptTask } from "./state-attempts.js";
import { decideRed, VALID_RED } from "./red-decision.js";
import { updateSession } from "./session.js";
import { type FeatureServices, runnersOf } from "./services.js";
import { updateFeature } from "./worktree-progress.js";

/** The first scenario of the requirement in file order that does not pass yet, with the names of all its scenarios; none when all pass. A name that two scenarios share is a problem. */
function currentScenario(worktree: string, fr: string): { current: CurrentScenario; names: string[] } | { problem: string } | undefined {
  const { paths } = loadProjectConfig(worktree);
  const own = listLocatedScenarios(readFeatureSources(worktree, paths.bdd_features)).filter(({ tags }) => tags.includes(`@${fr}`));
  const names = own.map(({ name }) => name);
  const twice = names.find((name, at) => names.indexOf(name) !== at);
  if (twice !== undefined) return { problem: `${fr}: the scenario "${twice}" is defined twice, and scenarios are told apart by their names` };
  const passing = loadProgress(worktree, paths.progress).features.find(({ id }) => id === fr)?.scenarios?.filter(({ bdd }) => bdd === SCENARIO_STATUS.pass).map(({ name }) => name) ?? [];
  const first = own.find(({ name }) => !passing.includes(name));
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

/** Runs BDD Red for the first scenario of the first target that does not pass: the agent writes its steps, the gate judges them and a valid Red is checkpointed. Returns the scenario that failed validly, or the exit code of the process. */
export async function runBddRed(started: Started, services: FeatureServices, featureHashes: Record<string, string>): Promise<number | RedScenario> {
  const { cwd, bus, workspace, targets } = started;
  const [fr] = targets;
  const found = currentScenario(workspace.path, fr!);
  if (found === undefined) return fail(started, `${fr}: no scenario is tagged with it`);
  if ("problem" in found) return fail(started, found.problem);
  const { current, names } = found;
  const label = `${fr} "${current.name}"`;
  updateSession(cwd, { fr, scenario: { index: names.indexOf(current.name), name: current.name, location: `${current.file}:${current.line}` }, innerIteration: 1 });
  const prompt = `${bddRedPrompt(fr!, `${current.file}:${current.line}`)}${NEWLINE}${NEWLINE}${bddRedContext(workspace.path, current)}`;
  const gate = await attemptsOf(started, services, {
    state: BDD_RED,
    role: "bdd-agent",
    label,
    run: async (info) => {
      const outcome = await runBillable(started, services, attemptTask(BDD_RED, prompt, info), { fr: fr!, announce: info.announce });
      const stopped = agentStop(started, label, outcome);
      if (stopped !== undefined) return stopped;
      const judged = bddRedGate(workspace.path, current, featureHashes, runnersOf(services));
      if (judged.kind === PROBLEM) return { rejected: `${label}: ${judged.problem}` };
      if (judged.kind !== OUTCOME.decision) return judged;
      const decided = await decideRed(bus, services.input ?? { isTTY: false }, { label, reason: judged.reason, message: judged.message, detail: judged.detail, step: judged.step });
      return decided === VALID_RED ? judged : decided;
    },
  });
  if (isExitCode(gate)) return gate;
  recordRed(workspace.path, fr!, { current: current.name, names });
  checkpoint(workspace, { fr: fr!, state: STATE.bddRed, scenario: current.name });
  updateSession(cwd, { state: STATE.tddRed, scenarioFailure: gate.message });
  transition(bus, STATE.bddRed, STATE.tddRed, `the scenario "${current.name}" fails validly: ${gate.kind === OUTCOME.valid ? gate.reason : "the person decided that it is a valid Red"}`);
  return { current, label, failure: gate.message };
}
