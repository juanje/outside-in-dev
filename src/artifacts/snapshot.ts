import { CATEGORIES, type Finding, type FindingCategory } from "./findings.js";

/** The lines of each scanned code file, by path, apart from the source files and the test files. */
export type ScannedCode = { source: Map<string, number>; tests: Map<string, number> };

/** The code health of the project at one run: the findings of each category and the percentage of duplicated lines. */
export type Snapshot = {
  date: string;
  counts: Record<FindingCategory, number>;
  duplication: { source: number; tests: number };
};

const DUPLICATED_LINES = /^(\d+) duplicated lines/;
const PERCENT = 100;
const DECIMALS = 10;

/** The lines of `files` that one duplication finding covers: the duplicated lines count once for each of its locations that is in `files`. */
function coveredLines(finding: Finding, files: Map<string, number>): number {
  const locations = [finding.file, ...(finding.related ?? []).map((other) => other.file)];
  return locations.filter((file) => files.has(file)).length * Number(DUPLICATED_LINES.exec(finding.detail)?.[1]);
}

/** The percentage, to one decimal, of the lines of `files` that duplication findings cover. */
function duplicatedPercentage(findings: Finding[], files: Map<string, number>): number {
  const total = [...files.values()].reduce((sum, lines) => sum + lines, 0);
  const duplicated = findings.filter((finding) => finding.category === "duplication").reduce((sum, finding) => sum + coveredLines(finding, files), 0);
  return total === 0 ? 0 : Math.round((duplicated / total) * PERCENT * DECIMALS) / DECIMALS;
}

/** The snapshot of `findings` at `date`; `scanned` gives the size of the code the duplication is measured against. */
export function buildSnapshot(findings: Finding[], scanned: ScannedCode, date: Date): Snapshot {
  const counts = Object.fromEntries(CATEGORIES.map((category) => [category, findings.filter((finding) => finding.category === category).length]));
  const duplication = { source: duplicatedPercentage(findings, scanned.source), tests: duplicatedPercentage(findings, scanned.tests) };
  return { date: date.toISOString(), counts: counts as Snapshot["counts"], duplication };
}

const SIDES = [
  ["source", "source files"],
  ["tests", "test files"],
] as const;

/** The lines that tell how `current` differs from the `previous` snapshot: each category whose count changed, then each duplication percentage that changed. */
export function renderTrend(previous: Snapshot | undefined, current: Snapshot): string[] {
  if (previous === undefined) return ["trend: first snapshot"];
  const counts = CATEGORIES.filter((category) => previous.counts[category] !== current.counts[category]).map(
    (category) => `trend: ${category} ${previous.counts[category]} → ${current.counts[category]}`,
  );
  const percentages = SIDES.filter(([side]) => previous.duplication[side] !== current.duplication[side]).map(
    ([side, label]) => `trend: duplication of ${label} ${previous.duplication[side].toFixed(1)}% → ${current.duplication[side].toFixed(1)}%`,
  );
  const lines = [...counts, ...percentages];
  return lines.length > 0 ? lines : ["trend: no change"];
}
