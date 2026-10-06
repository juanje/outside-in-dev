import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "./atomic-write.js";
import { compareText, type FindingDraft } from "./findings.js";
import { HISTORY_DIR } from "./metrics-history.js";

const NUMBER = /\d+/g;

/** The identity of a finding across runs, never made of its lines: category, file, symbol and detail; the numbers of a complexity detail are left out because they move while the function stays the same; a duplication has its two files, sorted, and its number of duplicated lines. */
export function findingKey({ category, file, symbol, detail, related = [] }: FindingDraft): string {
  if (category === "duplication") return JSON.stringify([category, [file, ...related.map((other) => other.file)].sort(compareText), detail]);
  return JSON.stringify([category, file, symbol, category === "complexity" ? detail.replace(NUMBER, "") : detail]);
}

const BASELINE_FILE = "baseline.json";

/** Records the identity of each of `findings` as the baseline of the project, replacing an earlier one and creating its directory when missing. */
export function writeBaseline(cwd: string, findings: FindingDraft[]): void {
  mkdirSync(join(cwd, HISTORY_DIR), { recursive: true });
  writeFileAtomic(join(cwd, HISTORY_DIR, BASELINE_FILE), `${JSON.stringify(findings.map(findingKey), null, 2)}\n`);
}

/** The identity of each finding of the baseline of the project, or `undefined` when none was recorded. */
export function readBaseline(cwd: string): Set<string> | undefined {
  const path = join(cwd, HISTORY_DIR, BASELINE_FILE);
  return existsSync(path) ? new Set(JSON.parse(readFileSync(path, "utf8")) as string[]) : undefined;
}
