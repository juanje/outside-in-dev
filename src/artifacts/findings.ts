type FindingCategory = "complexity" | "dead_code" | "doc_drift" | "duplication" | "magic_value";

export interface FindingDraft {
  category: FindingCategory;
  file: string;
  range: { start: number; end: number };
  symbol?: string;
  detail: string;
  related?: { file: string; range: { start: number; end: number } }[];
}

export interface Finding extends FindingDraft {
  id: string;
}

const ID_PREFIX: Record<FindingCategory, string> = { complexity: "cx", dead_code: "dead", doc_drift: "doc", duplication: "dup", magic_value: "magic" };
const ID_DIGITS = 4;
const CATEGORIES = Object.keys(ID_PREFIX) as FindingCategory[];

export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareDrafts(a: FindingDraft, b: FindingDraft): number {
  return compareText(a.category, b.category) || compareText(a.file, b.file) || a.range.start - b.range.start;
}

/** The drafts in output order (category, file, start line), each with its id numbered within its category. */
export function numberFindings(drafts: FindingDraft[]): Finding[] {
  const counts = new Map<FindingCategory, number>();
  return [...drafts].sort(compareDrafts).map((draft) => {
    const number = (counts.get(draft.category) ?? 0) + 1;
    counts.set(draft.category, number);
    return { id: `${ID_PREFIX[draft.category]}-${String(number).padStart(ID_DIGITS, "0")}`, ...draft };
  });
}

/** One output line: `<category> <file>:<start>-<end> [<symbol>] <detail>`, without the brackets when there is no symbol, then `, also <file>:<start>-<end>` for each related location. */
export function formatFinding({ category, file, range, symbol, detail, related = [] }: Finding): string {
  const symbolPart = symbol === undefined ? "" : ` [${symbol}]`;
  const relatedPart = related.map((other) => `, also ${other.file}:${other.range.start}-${other.range.end}`).join("");
  return `${category} ${file}:${range.start}-${range.end}${symbolPart} ${detail}${relatedPart}`;
}

/** The report: one line per finding, then the count of each category that has findings (`complexity 2, duplication 1`); `no findings` when there are none. */
export function renderReport(findings: Finding[]): string {
  if (findings.length === 0) return "no findings\n";
  const lines = findings.map(formatFinding);
  const counts = CATEGORIES.map((category) => ({ category, count: findings.filter((finding) => finding.category === category).length }))
    .filter(({ count }) => count > 0)
    .map(({ category, count }) => `${category} ${count}`);
  return `${[...lines, counts.join(", ")].join("\n")}\n`;
}
