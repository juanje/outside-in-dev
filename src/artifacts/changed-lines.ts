export type LineRange = { start: number; end: number };

const FILE_HEADER = /^\+\+\+ (?:b\/(.+)|\/dev\/null)$/;
const HUNK_HEADER = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/;

/** The line ranges each file of a `git diff --unified=0` gains or changes, by file path; files and hunks that add no line are left out. */
export function parseChangedLines(diff: string): Map<string, LineRange[]> {
  const changed = new Map<string, LineRange[]>();
  let file: string | undefined;
  for (const line of diff.split("\n")) {
    const header = FILE_HEADER.exec(line);
    if (header) file = header[1];
    const hunk = HUNK_HEADER.exec(line);
    const count = Number(hunk?.[2] ?? 1);
    if (hunk && file !== undefined && count > 0) {
      const start = Number(hunk[1]);
      changed.set(file, [...(changed.get(file) ?? []), { start, end: start + count - 1 }]);
    }
  }
  return changed;
}

type Located = { file: string; range: LineRange };

/** Whether the range of `finding`, or of any other location it names, shares a line with the changed lines of its file. */
export function overlapsChangedLines({ file, range, related = [] }: Located & { related?: Located[] }, changed: Map<string, LineRange[]>): boolean {
  return [{ file, range }, ...related].some((part) =>
    (changed.get(part.file) ?? []).some((lines) => lines.start <= part.range.end && part.range.start <= lines.end),
  );
}

/** The number of lines of `text`: a last line without a line break counts, the empty text has none. */
export function countLines(text: string): number {
  const breaks = text.split("\n").length - 1;
  return text.endsWith("\n") || text === "" ? breaks : breaks + 1;
}
