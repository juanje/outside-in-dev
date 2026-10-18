import { bddProblems } from "../artifacts/cucumber-report.js";
import { NEWLINE } from "../artifacts/lines.js";
import { locatePassingScenarios } from "../artifacts/passing-scenarios.js";
import { loadProgress } from "../artifacts/progress.js";
import { loadProjectConfig } from "../artifacts/project-config.js";
import { FAILURE } from "../artifacts/red-classification.js";
import { listLocatedScenarios, readFeatureSources } from "../artifacts/traceability.js";
import { REAL_RUNNERS, type Runners } from "../artifacts/verify-runner.js";
import { classifyObservation, observeBddRun } from "../commands/verify.js";
import { type Rejection, rejection } from "../artifacts/rejection.js";
import { type CurrentScenario, PROBLEM, scenarioSubject } from "./bdd-red-gate.js";

/** The kinds of a result that do not stop the run: the scenario passes, or it is still red. */
export const SCENARIO = { pass: "pass", red: "red" } as const;

/** What the check of the current scenario found: it passes, it is still red (with the failure as the runner gave it), or a problem stops the run. */
export type BddCheck = { kind: typeof SCENARIO.pass } | { kind: typeof SCENARIO.red; message: string } | { kind: typeof PROBLEM; problem: Rejection };

/** Which passing scenarios a check runs with the current one: those of the whole project, or only those of the feature of the current scenario (the quality gate runs the others). */
export const CHECK_SCOPE = { project: "whole project", feature: "feature" } as const;
export type CheckScope = (typeof CHECK_SCOPE)[keyof typeof CHECK_SCOPE];

/** Runs the current scenario and the scenarios that passed (of `scope`), in one run, and says what it showed: a scenario that passed and no longer does is a problem before anything else. */
export function bddCheck(worktree: string, scenario: CurrentScenario, culprit = "Code Green", runners: Runners = REAL_RUNNERS, scope: CheckScope = CHECK_SCOPE.project): BddCheck {
  const config = loadProjectConfig(worktree);
  const progress = loadProgress(worktree, config.paths.progress);
  const located = listLocatedScenarios(readFeatureSources(worktree, config.paths.bdd_features));
  const tags = located.find((candidate) => candidate.file === scenario.file && candidate.line === scenario.line)?.tags ?? [];
  const everywhere = locatePassingScenarios(progress, located).found;
  const passing = scope === CHECK_SCOPE.feature ? everywhere.filter(({ feature }) => tags.includes(`@${feature}`)) : everywhere;
  const run = runners.bddScenarios(worktree, config.commands.bdd, [scenario, ...passing]);
  const broken = run.report === undefined ? [] : bddProblems(run.report, passing);
  if (broken.length > 0) {
    return { kind: PROBLEM, problem: rejection({ failed: `${culprit} broke scenarios that passed`, evidence: broken.join(NEWLINE), next: "fix the code so that the scenarios listed pass again, without changing any test, then check each with the try tool" }) };
  }
  const observation = observeBddRun(worktree, config, scenario, run);
  const { failure } = observation;
  if (failure.kind === FAILURE.passed) return { kind: SCENARIO.pass };
  if (failure.kind === FAILURE.error) return { kind: SCENARIO.red, message: failure.message };
  return { kind: PROBLEM, problem: rejection({ failed: classifyObservation(worktree, config, observation).reason, evidence: scenarioSubject(scenario), next: "make the scenario run to an assertion: fix the code it needs, then check the scenario with the try tool" }) };
}
