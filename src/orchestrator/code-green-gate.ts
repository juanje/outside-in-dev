import { CYCLE_STEP, loadProgress } from "../artifacts/progress.js";
import { loadProjectConfig } from "../artifacts/project-config.js";
import { REAL_RUNNERS, type Runners } from "../artifacts/verify-runner.js";
import { suiteProblems, typecheckRun } from "../commands/verify-green.js";
import { integrityProblems } from "../commands/verify-integrity.js";

/** Judges the code an agent wrote in `step`: what the step does not allow (cheapest first), then the whole unit suite and the type check. The problems are one line each; none means the code is green. A type error is shown as the compiler printed it. */
export function codeGreenGate(worktree: string, step: string = CYCLE_STEP.tddGreen, runners: Runners = REAL_RUNNERS): string[] {
  const config = loadProjectConfig(worktree);
  const early = integrityProblems(worktree, config, loadProgress(worktree, config.paths.progress), step);
  if (early.length > 0) return early;
  const types = typecheckRun(worktree, config, false, runners);
  return [...suiteProblems(worktree, config, runners), ...(types.problems.length > 0 && types.errors.length > 0 ? types.errors : types.problems)];
}
