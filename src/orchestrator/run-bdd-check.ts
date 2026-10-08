import { checkpoint } from "../artifacts/git-checkpoints.js";
import { advanceStep, CYCLE_STEP, recordScenario, SCENARIO_STATUS } from "../artifacts/progress.js";
import { loadInnerIterationLimit } from "../artifacts/project-config.js";
import { bddCheck, SCENARIO } from "./bdd-check.js";
import { PROBLEM } from "./bdd-red-gate.js";
import { type Started, STATE, transition } from "./begin.js";
import { fail, type RedScenario } from "./run-bdd-red.js";
import type { FeatureServices } from "./services.js";
import { updateSession } from "./session.js";
import { stuckLoop } from "./stuck-loop.js";
import { updateFeature } from "./worktree-progress.js";

/** What the check of a scenario after Code Green leads to: another scenario, the end of the requirement's scenarios, or another iteration of the inner loop with the failure that is left. */
export const AFTER_CHECK = { next: "next", last: "last", again: "again" } as const;
export type AfterCheck = { kind: typeof AFTER_CHECK.next } | { kind: typeof AFTER_CHECK.last } | { kind: typeof AFTER_CHECK.again; failure: string };

/** Records the scenario as passing, checkpoints it and moves the run on: to BDD Red for the next scenario that does not pass, or to the quality gate when every scenario passes. */
function scenarioPasses(started: Started, scenario: RedScenario): AfterCheck {
  const { cwd, bus, workspace, targets } = started;
  const [fr] = targets;
  let moreToDo = false;
  updateFeature(workspace.path, fr!, (feature) => {
    const recorded = recordScenario(feature, scenario.current.name, SCENARIO_STATUS.pass);
    moreToDo = (recorded.scenarios ?? []).some(({ bdd }) => bdd !== SCENARIO_STATUS.pass);
    return advanceStep(recorded, moreToDo ? CYCLE_STEP.bddRed : CYCLE_STEP.qualityGate);
  });
  checkpoint(workspace, { fr: fr!, state: STATE.bddCheck, scenario: scenario.current.name });
  const next = moreToDo ? STATE.bddRed : STATE.qualityGate;
  updateSession(cwd, { state: next });
  transition(bus, STATE.bddCheck, next, moreToDo ? `the scenario "${scenario.current.name}" passes; the next scenario is next` : `every scenario of ${fr} passes; the quality gate is next`);
  return moreToDo ? { kind: AFTER_CHECK.next } : { kind: AFTER_CHECK.last };
}

/** Sends the run back to TDD Red for another iteration of the inner loop, with the failure the scenario still shows. */
function anotherIteration(started: Started, scenario: RedScenario, iteration: number, failure: string): AfterCheck {
  const { cwd, bus, workspace, targets } = started;
  updateFeature(workspace.path, targets[0]!, (feature) => advanceStep(feature, CYCLE_STEP.tddRed));
  updateSession(cwd, { state: STATE.tddRed, innerIteration: iteration + 1 });
  transition(bus, STATE.bddCheck, STATE.tddRed, `the scenario "${scenario.current.name}" is still red after ${iteration} iterations`);
  return { kind: AFTER_CHECK.again, failure };
}

/** Where a BDD Check comes from: the state before it and what that state did, when it did something (the reason of the transition starts with the note). */
export type Origin = { from: string; note: string };

/** Runs BDD Check for the current scenario after Code Green or after the refactor that followed it: the scenario and the scenarios that passed run together. Returns what follows, or the exit code of the process. */
export async function runBddCheck(started: Started, services: FeatureServices, scenario: RedScenario, iteration: number, origin: Origin = { from: STATE.codeGreen, note: "" }): Promise<number | AfterCheck> {
  const { cwd, bus, workspace } = started;
  const check = bddCheck(workspace.path, scenario.current);
  if (check.kind === PROBLEM) return fail(started, `${scenario.label}: ${check.problem}`);
  updateSession(cwd, { state: STATE.bddCheck });
  const verdict = `the scenario "${scenario.current.name}" ${check.kind === SCENARIO.pass ? "passes" : "is still red"}`;
  transition(bus, origin.from, STATE.bddCheck, origin.note === "" ? verdict : `${origin.note}; ${verdict}`);
  if (check.kind === SCENARIO.pass) return scenarioPasses(started, scenario);
  if (iteration >= loadInnerIterationLimit(workspace.path)) return stuckLoop(bus, services.input ?? { isTTY: false }, { label: scenario.label, iterations: iteration });
  return anotherIteration(started, scenario, iteration, check.message);
}
