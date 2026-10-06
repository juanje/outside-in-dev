import { detectCommentedOutCode, detectComplexity, detectDocDrift, detectDuplication, detectMagicValues, detectUnusedCode, detectUnusedDeclarations, scannedCode } from "../artifacts/code-health.js";
import { overlapsChangedLines } from "../artifacts/changed-lines.js";
import { readChangedLines } from "../artifacts/git-changes.js";
import { numberFindings, renderReport } from "../artifacts/findings.js";
import { appendSnapshot, readLastSnapshot } from "../artifacts/metrics-history.js";
import { loadComplexityLimits, loadDuplicationLimits, loadMagicValueLimits, loadRefactorEntry } from "../artifacts/project-config.js";
import { loadProjectPaths } from "../artifacts/project-paths.js";
import { buildSnapshot, renderTrend } from "../artifacts/snapshot.js";
import type { CliIo } from "../cli-io.js";

/** Prints the code-health findings of the project, only those on lines changed since HEAD when `changed` is set. Findings do not change the exit code. */
export function runMetrics(io: CliIo, changed: boolean): number {
  const changedLines = changed ? readChangedLines(io.cwd) : undefined;
  const paths = loadProjectPaths(io.cwd);
  const drafts = [
    ...detectComplexity(io.cwd, paths, loadComplexityLimits(io.cwd)),
    ...detectDuplication(io.cwd, paths, loadDuplicationLimits(io.cwd)),
    ...detectUnusedCode(io.cwd, paths, loadRefactorEntry(io.cwd)),
    ...detectUnusedDeclarations(io.cwd, paths),
    ...detectCommentedOutCode(io.cwd, paths),
    ...detectDocDrift(io.cwd, paths),
    ...detectMagicValues(io.cwd, paths, loadMagicValueLimits(io.cwd)),
  ];
  const shown = changedLines === undefined ? drafts : drafts.filter((draft) => overlapsChangedLines(draft, changedLines));
  const findings = numberFindings(shown);
  io.stdout(renderReport(findings));
  if (changedLines === undefined) {
    const snapshot = buildSnapshot(findings, scannedCode(io.cwd, paths), new Date());
    io.stdout(`${renderTrend(readLastSnapshot(io.cwd), snapshot).join("\n")}\n`);
    appendSnapshot(io.cwd, snapshot);
  }
  return 0;
}
