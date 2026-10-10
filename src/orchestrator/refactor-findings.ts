import { CATALOGUE_HEADING, fileSection, joinSections } from "../agents/context/task-context.js";
import { reuseCatalogue } from "../agents/context/reuse-catalogue.js";
import { findingKey } from "../artifacts/baseline.js";
import { type LineRange, overlapsChangedLines } from "../artifacts/changed-lines.js";
import { type Finding, type FindingDraft, formatFinding } from "../artifacts/findings.js";
import { NEWLINE } from "../artifacts/lines.js";
import { readText } from "../artifacts/project-json.js";

/** The findings worth fixing. Until the decision model exists (FR-DEC), the conservative default of design section 8.6 keeps every one. */
export function triage(findings: Finding[]): Finding[] {
  return findings;
}

/** The findings on the changed lines that the baseline of the run does not hold: what a Green introduced. */
export function newFindings(drafts: FindingDraft[], changed: Map<string, LineRange[]>, held: Set<string>): FindingDraft[] {
  return drafts.filter((draft) => overlapsChangedLines(draft, changed) && !held.has(findingKey(draft)));
}

/** A finding as a section of a prompt: its line, then the code of its lines. */
function findingSection(cwd: string, finding: Finding): string {
  const code = (readText(cwd, finding.file) ?? "").split(NEWLINE).slice(finding.range.start - 1, finding.range.end);
  return [formatFinding(finding), ...code].join(NEWLINE);
}

/** The prompt of a refactor task: the findings with the code of their lines, the files they are in in full and the reuse catalogue; no test. */
export function refactorContext(cwd: string, findings: Finding[]): string {
  const files = [...new Set(findings.map(({ file }) => file))];
  const sections = [
    ["Findings to fix:", ...findings.map((finding) => findingSection(cwd, finding))],
    ["Files with findings:", ...files.map((file) => fileSection(cwd, file))],
    [CATALOGUE_HEADING, reuseCatalogue(cwd, { used: files })],
  ];
  return joinSections(sections);
}
