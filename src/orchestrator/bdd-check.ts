import { bddProblems } from "../artifacts/cucumber-report.js";
import { NEWLINE } from "../artifacts/lines.js";
import { locatePassingScenarios } from "../artifacts/passing-scenarios.js";
import { loadProgress } from "../artifacts/progress.js";
import { loadProjectConfig } from "../artifacts/project-config.js";
import { FAILURE } from "../artifacts/red-classification.js";
import { listLocatedScenarios, readFeatureSources } from "../artifacts/traceability.js";
import { runBddScenarios } from "../artifacts/verify-runner.js";
import { classifyObservation, observeBddRun } from "../commands/verify.js";
import { type CurrentScenario, PROBLEM } from "./bdd-red-gate.js";

/** The kinds of a result that do not stop the run: the scenario passes, or it is still red. */
export const SCENARIO = { pass: "pass", red: "red" } as const;

/** What the check of the current scenario found: it passes, it is still red (with the failure as the runner gave it), or a problem stops the run. */
export type BddCheck = { kind: typeof SCENARIO.pass } | { kind: typeof SCENARIO.red; message: string } | { kind: typeof PROBLEM; problem: string };

/** Runs the current scenario and every scenario that passed, in one run, and says what it showed: a scenario that passed and no longer does is a problem before anything else. */
export function bddCheck(worktree: string, scenario: CurrentScenario): BddCheck {
  const config = loadProjectConfig(worktree);
  const progress = loadProgress(worktree, config.paths.progress);
  const passing = locatePassingScenarios(progress, listLocatedScenarios(readFeatureSources(worktree, config.paths.bdd_features))).found;
  const run = runBddScenarios(worktree, config.commands.bdd, [scenario, ...passing]);
  const broken = run.report === undefined ? [] : bddProblems(run.report, passing);
  if (broken.length > 0) return { kind: PROBLEM, problem: ["Code Green broke scenarios that passed:", ...broken].join(NEWLINE) };
  const observation = observeBddRun(worktree, config, scenario, run);
  const { failure } = observation;
  if (failure.kind === FAILURE.passed) return { kind: SCENARIO.pass };
  if (failure.kind === FAILURE.error) return { kind: SCENARIO.red, message: failure.message };
  return { kind: PROBLEM, problem: classifyObservation(worktree, config, observation).reason };
}
