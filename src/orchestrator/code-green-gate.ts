import { CYCLE_STEP, loadProgress } from "../artifacts/progress.js";
import { loadProjectConfig } from "../artifacts/project-config.js";
import { suiteProblems, typecheckRun } from "../commands/verify-green.js";
import { integrityProblems } from "../commands/verify-integrity.js";

/** Judges the code an agent wrote in `step`: what the step does not allow (cheapest first), then the whole unit suite and the type check. The problems are one line each; none means the code is green. A type error is shown as the compiler printed it. */
export function codeGreenGate(worktree: string, step: string = CYCLE_STEP.tddGreen): string[] {
  const config = loadProjectConfig(worktree);
  const early = integrityProblems(worktree, config, loadProgress(worktree, config.paths.progress), step);
  if (early.length > 0) return early;
  const types = typecheckRun(worktree, config);
  return [...suiteProblems(worktree, config), ...(types.problems.length > 0 && types.errors.length > 0 ? types.errors : types.problems)];
}
