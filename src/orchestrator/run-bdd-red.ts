import { bddRedContext } from "../agents/context/task-context.js";
import { BDD_RED } from "../agents/profiles.js";
import { bddRedPrompt } from "../agents/prompts/bdd-red.js";
import { runAgent } from "../agents/runner.js";
import { NEWLINE } from "../artifacts/lines.js";
import { checkpoint } from "../artifacts/git-checkpoints.js";
import { advanceStep, CYCLE_STEP, loadProgress, recordScenario, SCENARIO_STATUS, saveProgress } from "../artifacts/progress.js";
import { loadProjectConfig } from "../artifacts/project-config.js";
import { OUTCOME } from "../artifacts/red-classification.js";
import { listLocatedScenarios, readFeatureSources } from "../artifacts/traceability.js";
import { ERROR_EVENT } from "../events/types.js";
import { agentContext, outcomeProblem } from "./agent-run.js";
import { bddRedGate, type CurrentScenario, PROBLEM } from "./bdd-red-gate.js";
import { type Started, STATE, transition } from "./begin.js";
import { decideRed, VALID_RED } from "./red-decision.js";
import { updateSession } from "./session.js";
import type { FeatureServices } from "./services.js";

/** The first scenario of the requirement in file order, with the names of all its scenarios. */
function currentScenario(worktree: string, fr: string): { current: CurrentScenario; names: string[] } | undefined {
  const { paths } = loadProjectConfig(worktree);
  const own = listLocatedScenarios(readFeatureSources(worktree, paths.bdd_features)).filter(({ tags }) => tags.includes(`@${fr}`));
  const [first] = own;
  return first === undefined ? undefined : { current: { file: first.file, line: first.line, name: first.name }, names: own.map(({ name }) => name) };
}

/** Moves the requirement to TDD Red in the progress file of the worktree, recording its scenarios: the current one as failing, the others as pending. */
function recordRed(worktree: string, fr: string, scenarios: { current: string; names: string[] }): void {
  const file = loadProjectConfig(worktree).paths.progress;
  const progress = loadProgress(worktree, file);
  const features = progress.features.map((feature) => {
    if (feature.id !== fr) return feature;
    const known = feature.scenarios ?? [];
    const registered = scenarios.names.filter((name) => !known.some((scenario) => scenario.name === name)).reduce((moved, name) => recordScenario(moved, name, SCENARIO_STATUS.pending), advanceStep(feature, CYCLE_STEP.tddRed));
    return recordScenario(registered, scenarios.current, SCENARIO_STATUS.fail);
  });
  saveProgress(worktree, { ...progress, features }, file);
}

/** Ends the run with an error that names `message`: returns the exit code of the process. */
function fail({ bus }: Started, message: string): number {
  return bus.emit({ type: ERROR_EVENT, message }) ?? 1;
}

/** Runs BDD Red for the first scenario of the first target: the agent writes its steps, the gate judges them and a valid Red is checkpointed. Returns the exit code of the process. */
export async function runBddRed(started: Started, services: FeatureServices, featureHashes: Record<string, string>): Promise<number> {
  const { cwd, bus, workspace, targets } = started;
  const [fr] = targets;
  const found = currentScenario(workspace.path, fr!);
  if (found === undefined) return fail(started, `${fr}: no scenario is tagged with it`);
  const { current, names } = found;
  const label = `${fr} "${current.name}"`;
  updateSession(cwd, { fr, scenario: { index: 0, name: current.name, location: `${current.file}:${current.line}` } });
  const prompt = `${bddRedPrompt(fr!)}${NEWLINE}${NEWLINE}${bddRedContext(workspace.path, current)}`;
  const outcome = await runAgent({ state: BDD_RED, prompt }, agentContext(started, services));
  const problem = outcomeProblem(label, outcome);
  if (problem !== undefined) return fail(started, problem);
  const gate = bddRedGate(workspace.path, current, featureHashes);
  if (gate.kind === PROBLEM) return fail(started, `${label}: ${gate.problem}`);
  if (gate.kind === OUTCOME.decision) {
    const decided = await decideRed(bus, services.input ?? { isTTY: false }, { label, reason: gate.reason, message: gate.message });
    if (decided !== VALID_RED) return decided;
  }
  recordRed(workspace.path, fr!, { current: current.name, names });
  checkpoint(workspace, { fr: fr!, state: STATE.bddRed, scenario: current.name });
  updateSession(cwd, { state: STATE.tddRed });
  transition(bus, STATE.bddRed, STATE.tddRed, `the scenario "${current.name}" fails validly: ${gate.kind === OUTCOME.valid ? gate.reason : "the person decided that it is a valid Red"}`);
  return 0;
}
