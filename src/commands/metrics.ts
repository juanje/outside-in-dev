import { detectCommentedOutCode, detectComplexity, detectDocDrift, detectDuplication, detectMagicValues, detectUnusedCode, detectUnusedDeclarations, scannedCode } from "../artifacts/code-health.js";
import { findingKey, readBaseline, writeBaseline } from "../artifacts/baseline.js";
import { type LineRange, overlapsChangedLines } from "../artifacts/changed-lines.js";
import { readChangedLines } from "../artifacts/git-changes.js";
import { type FindingDraft, numberFindings, renderReport } from "../artifacts/findings.js";
import { appendSnapshot, readLastSnapshot } from "../artifacts/metrics-history.js";
import { ProgressError } from "../artifacts/progress.js";
import { loadComplexityLimits, loadDuplicationLimits, loadMagicValueLimits, loadRefactorEntry } from "../artifacts/project-config.js";
import { loadProjectPaths, type ProjectPaths } from "../artifacts/project-paths.js";
import { buildSnapshot, renderTrend } from "../artifacts/snapshot.js";
import type { CliIo } from "../cli-io.js";

/** `1 finding`, `2 findings`; `adjective` goes before the noun (`2 existing findings`). */
function countFindings(count: number, adjective = ""): string {
  return `${count} ${adjective}${count === 1 ? "finding" : "findings"}`;
}

function detectAll(cwd: string, paths: ProjectPaths): FindingDraft[] {
  return [
    ...detectComplexity(cwd, paths, loadComplexityLimits(cwd)),
    ...detectDuplication(cwd, paths, loadDuplicationLimits(cwd)),
    ...detectUnusedCode(cwd, paths, loadRefactorEntry(cwd)),
    ...detectUnusedDeclarations(cwd, paths),
    ...detectCommentedOutCode(cwd, paths),
    ...detectDocDrift(cwd, paths),
    ...detectMagicValues(cwd, paths, loadMagicValueLimits(cwd)),
  ];
}

/** Prints the findings on the changed lines that the baseline does not hold, then how many it holds and left out; the exit code is 1 when a new finding remains. */
function reportNew(io: CliIo, drafts: FindingDraft[], changedLines: Map<string, LineRange[]>): number {
  const onChangedLines = drafts.filter((draft) => overlapsChangedLines(draft, changedLines));
  const existing = readBaseline(io.cwd);
  if (existing === undefined) io.stderr("no baseline: every finding on the changed lines counts as new; run oid metrics --baseline to record the existing ones\n");
  const added = onChangedLines.filter((draft) => !existing?.has(findingKey(draft)));
  io.stdout(renderReport(numberFindings(added)));
  const left = onChangedLines.length - added.length;
  if (left > 0) io.stdout(`${countFindings(left, "existing ")} left out\n`);
  return added.length > 0 ? 1 : 0;
}

/** Prints every finding, records a snapshot and prints the trend against the previous one. */
function reportAll(io: CliIo, drafts: FindingDraft[], paths: ProjectPaths): number {
  const findings = numberFindings(drafts);
  io.stdout(renderReport(findings));
  const snapshot = buildSnapshot(findings, scannedCode(io.cwd, paths), new Date());
  io.stdout(`${renderTrend(readLastSnapshot(io.cwd), snapshot).join("\n")}\n`);
  appendSnapshot(io.cwd, snapshot);
  return 0;
}

/** Runs the code-health detectors and prints their findings. `baseline` records them as the existing debt; `changed` keeps the new findings on lines changed since HEAD and exits 1 when one remains; otherwise it prints all of them and exits 0. */
export function runMetrics(io: CliIo, { changed, baseline }: { changed: boolean; baseline: boolean }): number {
  if (changed && baseline) throw new ProgressError("--changed and --baseline cannot be used together");
  const changedLines = changed ? readChangedLines(io.cwd) : undefined;
  const paths = loadProjectPaths(io.cwd);
  const drafts = detectAll(io.cwd, paths);
  if (baseline) {
    writeBaseline(io.cwd, drafts);
    io.stdout(`baseline: ${countFindings(drafts.length)} recorded in .outside-in/baseline.json\n`);
    return 0;
  }
  return changedLines === undefined ? reportAll(io, drafts, paths) : reportNew(io, drafts, changedLines);
}
