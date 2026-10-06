import { detectCommentedOutCode, detectComplexity, detectDuplication, detectMagicValues, detectUnusedCode, detectUnusedDeclarations } from "../artifacts/code-health.js";
import { numberFindings, renderReport } from "../artifacts/findings.js";
import { loadComplexityLimits, loadDuplicationLimits, loadMagicValueLimits, loadRefactorEntry } from "../artifacts/project-config.js";
import { loadProjectPaths } from "../artifacts/project-paths.js";
import type { CliIo } from "../cli-io.js";

/** Prints the code-health findings of the project. Findings do not change the exit code. */
export function runMetrics(io: CliIo): number {
  const paths = loadProjectPaths(io.cwd);
  const drafts = [
    ...detectComplexity(io.cwd, paths, loadComplexityLimits(io.cwd)),
    ...detectDuplication(io.cwd, paths, loadDuplicationLimits(io.cwd)),
    ...detectUnusedCode(io.cwd, paths, loadRefactorEntry(io.cwd)),
    ...detectUnusedDeclarations(io.cwd, paths),
    ...detectCommentedOutCode(io.cwd, paths),
    ...detectMagicValues(io.cwd, paths, loadMagicValueLimits(io.cwd)),
  ];
  io.stdout(renderReport(numberFindings(drafts)));
  return 0;
}
