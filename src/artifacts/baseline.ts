import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "./atomic-write.js";
import { compareText, type FindingDraft } from "./findings.js";
import { HISTORY_DIR } from "./metrics-history.js";

const NUMBER = /\d+/g;

/** What the baseline file holds for a finding: its category, file, symbol and detail, never its lines. */
export function findingRecord({ category, file, symbol, detail: measured, related = [] }: FindingDraft): Record<string, unknown> {
  if (category === "duplication") return { category, files: [file, ...related.map((other) => other.file)].sort(compareText), detail: measured };
  const detail = category === "complexity" ? measured.replace(NUMBER, "N") : measured;
  return symbol === undefined ? { category, file, detail } : { category, file, symbol, detail };
}

/** The identity of a finding across runs: its record, which holds no line. */
export function findingKey(draft: FindingDraft): string {
  return JSON.stringify(findingRecord(draft));
}

const BASELINE_FILE = "baseline.json";

/** Records each of `findings` as a readable record as the baseline of the project, replacing an earlier one and creating its directory when missing. */
export function writeBaseline(cwd: string, findings: FindingDraft[]): void {
  mkdirSync(join(cwd, HISTORY_DIR), { recursive: true });
  writeFileAtomic(join(cwd, HISTORY_DIR, BASELINE_FILE), `${JSON.stringify(findings.map(findingRecord), null, 2)}\n`);
}

/** The identity (see `findingKey`) of each finding of the baseline of the project, or `undefined` when none was recorded. */
export function readBaseline(cwd: string): Set<string> | undefined {
  const path = join(cwd, HISTORY_DIR, BASELINE_FILE);
  return existsSync(path) ? new Set((JSON.parse(readFileSync(path, "utf8")) as unknown[]).map((record) => JSON.stringify(record))) : undefined;
}
