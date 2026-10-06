import { detectComplexity } from "../artifacts/code-health.js";
import { numberFindings, renderReport } from "../artifacts/findings.js";
import { loadComplexityLimits } from "../artifacts/project-config.js";
import { loadProjectPaths } from "../artifacts/project-paths.js";
import type { CliIo } from "../cli-io.js";

/** Prints the code-health findings of the project. Findings do not change the exit code. */
export function runMetrics(io: CliIo): number {
  const drafts = detectComplexity(io.cwd, loadProjectPaths(io.cwd), loadComplexityLimits(io.cwd));
  io.stdout(renderReport(numberFindings(drafts)));
  return 0;
}
