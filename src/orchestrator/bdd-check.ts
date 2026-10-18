import { loadProjectConfig } from "../artifacts/project-config.js";
import { FAILURE } from "../artifacts/red-classification.js";
import { REAL_RUNNERS, type Runners } from "../artifacts/verify-runner.js";
import { classifyObservation, observeBddRun } from "../commands/verify.js";
import { type Rejection, rejection } from "../artifacts/rejection.js";
import { type CurrentScenario, PROBLEM, scenarioSubject } from "./bdd-red-gate.js";

/** The kinds of a result that do not stop the run: the scenario passes, or it is still red. */
export const SCENARIO = { pass: "pass", red: "red" } as const;

/** What the check of the current scenario found: it passes, it is still red (with the failure as the runner gave it), or a problem stops the run. */
export type BddCheck = { kind: typeof SCENARIO.pass } | { kind: typeof SCENARIO.red; message: string } | { kind: typeof PROBLEM; problem: Rejection };

/** Runs the current scenario alone and says what it showed. The scenarios that passed are the gate of Code Green's and the quality gate's. */
export function bddCheck(worktree: string, scenario: CurrentScenario, runners: Runners = REAL_RUNNERS): BddCheck {
  const config = loadProjectConfig(worktree);
  const run = runners.bddScenarios(worktree, config.commands.bdd, [scenario]);
  const observation = observeBddRun(worktree, config, scenario, run);
  const { failure } = observation;
  if (failure.kind === FAILURE.passed) return { kind: SCENARIO.pass };
  if (failure.kind === FAILURE.error) return { kind: SCENARIO.red, message: failure.message };
  return { kind: PROBLEM, problem: rejection({ failed: classifyObservation(worktree, config, observation).reason, evidence: scenarioSubject(scenario), next: "make the scenario run to an assertion: fix the code it needs, then check the scenario with the try tool" }) };
}
