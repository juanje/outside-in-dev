import { readFileSync } from "node:fs";
import { join } from "node:path";
import { baseContent, GIT_DIFF, runGit } from "./checkpoint.js";
import { countLines, type LineRange, parseChangedLines } from "./changed-lines.js";
import type { AddedLine } from "./integrity.js";

const STDIN = "-";
const NEWLINE = "\n";

/** The line ranges of `file` that differ from `base`. */
function rangesDiffering(cwd: string, file: string, base: string): LineRange[] {
  const diff = runGit(cwd, [GIT_DIFF, "--no-index", "--unified=0", "--no-color", "--", STDIN, file], base);
  return parseChangedLines(diff.text).get(file) ?? [];
}

/** The lines of `file` that differ from its content at the checkpoint of `feature`, or in HEAD when there is no checkpoint or the file is not in it; every line of a file that neither has. */
export function addedLines(cwd: string, file: string, feature: string | null): AddedLine[] {
  const text = readFileSync(join(cwd, file)).toString();
  const base = baseContent(cwd, file, feature);
  const ranges = base === undefined ? [{ start: 1, end: countLines(text) }] : rangesDiffering(cwd, file, base);
  const lines = text.split(NEWLINE);
  return ranges.flatMap(({ start, end }) => lines.slice(start - 1, end).map((line, at) => ({ line: start + at, text: line })));
}
