import { bddProblems } from "../artifacts/cucumber-report.js";
import { locatePassingScenarios } from "../artifacts/passing-scenarios.js";
import { CYCLE_STEP, loadProgress } from "../artifacts/progress.js";
import { loadProjectConfig } from "../artifacts/project-config.js";
import { listLocatedScenarios, readFeatureSources } from "../artifacts/traceability.js";
import { REAL_RUNNERS, type Runners } from "../artifacts/verify-runner.js";
import { suiteProblems, typecheckRun } from "../commands/verify-green.js";
import { integrityProblems } from "../commands/verify-integrity.js";
import type { CurrentScenario } from "./bdd-red-gate.js";

/** Judges the code an agent wrote in `step`: what the step does not allow (cheapest first), then the whole unit suite and the type check, then the scenarios of the feature of `scenario` that passed (those of other features are the quality gate's). The problems are one line each; none means the code is green. A type error is shown as the compiler printed it. */
export function codeGreenGate(worktree: string, step: string = CYCLE_STEP.tddGreen, runners: Runners = REAL_RUNNERS, scenario?: CurrentScenario): string[] {
  const config = loadProjectConfig(worktree);
  const progress = loadProgress(worktree, config.paths.progress);
  const early = integrityProblems(worktree, config, progress, step);
  if (early.length > 0) return early;
  const types = typecheckRun(worktree, config, false, runners);
  const problems = [...suiteProblems(worktree, config, runners), ...(types.problems.length > 0 && types.errors.length > 0 ? types.errors : types.problems)];
  if (scenario === undefined || problems.length > 0) return problems;
  const located = listLocatedScenarios(readFeatureSources(worktree, config.paths.bdd_features));
  const tags = located.find((candidate) => candidate.file === scenario.file && candidate.line === scenario.line)?.tags ?? [];
  const passing = locatePassingScenarios(progress, located).found.filter(({ feature }) => tags.includes(`@${feature}`));
  if (passing.length === 0) return problems;
  const run = runners.bddScenarios(worktree, config.commands.bdd, passing);
  return [...problems, ...(run.report === undefined ? [] : bddProblems(run.report, passing))];
}
