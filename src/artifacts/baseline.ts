import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "./atomic-write.js";
import { z } from "zod";
import { CATEGORIES, CATEGORY, compareText, type FindingDraft } from "./findings.js";
import { HISTORY_DIR } from "./metrics-history.js";
import { ProgressError } from "./progress.js";

const NUMBER = /\d+/g;
/** A measure in a complexity detail and its limit: `cyclomatic complexity 12 > 10` measures 12. */
const MEASURE = /(\d+) > \d+/g;
const DUPLICATION = CATEGORY.duplication;
const COMPLEXITY = CATEGORY.complexity;

/** What the baseline file holds for a finding: its category, file, symbol and detail, never its lines; a complexity finding keeps its numbers as N in the detail and its actual measure in `measured`. */
export function findingRecord({ category, file, symbol, detail: measured, related = [] }: FindingDraft): Record<string, unknown> {
  if (category === DUPLICATION) return { category, files: [file, ...related.map((other) => other.file)].sort(compareText), detail: measured };
  const detail = category === COMPLEXITY ? measured.replace(NUMBER, "N") : measured;
  const identity = symbol === undefined ? { category, file, detail } : { category, file, symbol, detail };
  return category === COMPLEXITY ? { ...identity, measured } : identity;
}

/** The identity of a record across runs: the record without its measure, so a function whose complexity moves stays the same finding. */
function recordKey({ measured: _measure, ...identity }: Record<string, unknown>): string {
  return JSON.stringify(identity);
}

/** The identity of a finding across runs: its record without lines or measure. */
export function findingKey(draft: FindingDraft): string {
  return recordKey(findingRecord(draft));
}

/** The measures of a complexity detail, in order. */
function measures(detail: string): number[] {
  return [...detail.matchAll(MEASURE)].map((match) => Number(match[1]));
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
    z.strictObject({ category: z.literal(COMPLEXITY), file: z.string(), symbol: z.string().optional(), detail: z.string(), measured: z.string() }),
    z.strictObject({ category: z.enum(CATEGORIES).exclude([DUPLICATION, COMPLEXITY]), file: z.string(), symbol: z.string().optional(), detail: z.string() }),
  ]),
);

/** The records of the baseline of the project, or `undefined` when none was recorded; a ProgressError when the file is not a list of records. */
function readRecords(cwd: string): Record<string, unknown>[] | undefined {
  const path = join(cwd, HISTORY_DIR, BASELINE_FILE);
  if (!existsSync(path)) return undefined;
  try {
    return baselineSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    throw new ProgressError(`${HISTORY_DIR}/${BASELINE_FILE} cannot be read: record it again with oid metrics --baseline`);
  }
}

/** The identity (see `findingKey`) of each finding of the baseline of the project, or `undefined` when none was recorded; a ProgressError when the file is not a list of records. */
export function readBaseline(cwd: string): Set<string> | undefined {
  const records = readRecords(cwd);
  return records === undefined ? undefined : new Set(records.map(recordKey));
}

/** Whether a finding is debt the baseline already holds: a finding of the same identity whose measure, for complexity, is no worse than the recorded one. Undefined when there is no baseline. */
export function baselineHolds(cwd: string): ((draft: FindingDraft) => boolean) | undefined {
  const records = readRecords(cwd);
  if (records === undefined) return undefined;
  const recorded = new Map(records.map((record) => [recordKey(record), record.measured as string | undefined]));
  return (draft) => {
    const key = findingKey(draft);
    if (!recorded.has(key)) return false;
    const before = recorded.get(key);
    if (before === undefined) return true;
    const was = measures(before);
    return measures(draft.detail).every((value, at) => value <= (was[at] ?? value));
  };
}
