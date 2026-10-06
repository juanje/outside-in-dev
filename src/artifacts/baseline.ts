import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "./atomic-write.js";
import { z } from "zod";
import { CATEGORIES, compareText, type FindingDraft } from "./findings.js";
import { HISTORY_DIR } from "./metrics-history.js";
import { ProgressError } from "./progress.js";

const NUMBER = /\d+/g;
const DUPLICATION = "duplication";

/** What the baseline file holds for a finding: its category, file, symbol and detail, never its lines. */
export function findingRecord({ category, file, symbol, detail: measured, related = [] }: FindingDraft): Record<string, unknown> {
  if (category === DUPLICATION) return { category, files: [file, ...related.map((other) => other.file)].sort(compareText), detail: measured };
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

const baselineSchema = z.array(
  z.union([
    z.strictObject({ category: z.literal(DUPLICATION), files: z.array(z.string()), detail: z.string() }),
    z.strictObject({ category: z.enum(CATEGORIES).exclude([DUPLICATION]), file: z.string(), symbol: z.string().optional(), detail: z.string() }),
  ]),
);

/** The identity (see `findingKey`) of each finding of the baseline of the project, or `undefined` when none was recorded; a ProgressError when the file is not a list of records. */
export function readBaseline(cwd: string): Set<string> | undefined {
  const path = join(cwd, HISTORY_DIR, BASELINE_FILE);
  if (!existsSync(path)) return undefined;
  try {
    return new Set(baselineSchema.parse(JSON.parse(readFileSync(path, "utf8"))).map((record) => JSON.stringify(record)));
  } catch {
    throw new ProgressError(`${HISTORY_DIR}/${BASELINE_FILE} cannot be read: record it again with oid metrics --baseline`);
  }
}
