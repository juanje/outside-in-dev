import { describe, expect, it } from "vitest";
import { overlapsChangedLines, parseChangedLines } from "../../src/artifacts/changed-lines.js";

const MODIFIED = [
  "diff --git a/src/limits.ts b/src/limits.ts",
  "index 1111111..2222222 100644",
  "--- a/src/limits.ts",
  "+++ b/src/limits.ts",
  "@@ -3,2 +3,3 @@ export const a = 1;",
  "-old",
  "-older",
  "+new",
  "+newer",
  "+newest",
  "@@ -9 +10 @@",
  "-gone",
  "+here",
  "",
].join("\n");

describe("parseChangedLines", () => {
  it("lists, per file, the line ranges that a unified=0 diff adds or modifies", () => {
    expect(parseChangedLines(MODIFIED)).toEqual(new Map([["src/limits.ts", [{ start: 3, end: 5 }, { start: 10, end: 10 }]]]));
  });

  it("leaves out deletion-only hunks, deleted files and pure renames, and names a renamed file by its new path", () => {
    const diff = [
      "diff --git a/src/shrunk.ts b/src/shrunk.ts",
      "--- a/src/shrunk.ts",
      "+++ b/src/shrunk.ts",
      "@@ -4,2 +3,0 @@",
      "-a",
      "-b",
      "diff --git a/src/gone.ts b/src/gone.ts",
      "deleted file mode 100644",
      "--- a/src/gone.ts",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-a",
      "-b",
      "diff --git a/src/same.ts b/src/moved.ts",
      "similarity index 100%",
      "rename from src/same.ts",
      "rename to src/moved.ts",
      "diff --git a/src/before.ts b/src/after.ts",
      "similarity index 90%",
      "rename from src/before.ts",
      "rename to src/after.ts",
      "--- a/src/before.ts",
      "+++ b/src/after.ts",
      "@@ -2 +2,2 @@",
      "-x",
      "+y",
      "+z",
      "diff --git a/src/fresh.ts b/src/fresh.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/src/fresh.ts",
      "@@ -0,0 +1,3 @@",
      "+a",
      "+b",
      "+c",
      "",
    ].join("\n");
    expect(parseChangedLines(diff)).toEqual(
      new Map([
        ["src/after.ts", [{ start: 2, end: 3 }]],
        ["src/fresh.ts", [{ start: 1, end: 3 }]],
      ]),
    );
  });
});

describe("overlapsChangedLines", () => {
  const changed = new Map([["src/a.ts", [{ start: 10, end: 12 }, { start: 30, end: 30 }]]]);
  const finding = (file: string, start: number, end: number) => ({ file, range: { start, end } });

  it("tells whether the range of a finding shares a line with the changed lines of its file", () => {
    expect(overlapsChangedLines(finding("src/a.ts", 12, 20), changed)).toBe(true);
    expect(overlapsChangedLines(finding("src/a.ts", 1, 40), changed)).toBe(true);
    expect(overlapsChangedLines(finding("src/a.ts", 13, 29), changed)).toBe(false);
    expect(overlapsChangedLines(finding("src/b.ts", 10, 12), changed)).toBe(false);
  });

  it("also counts the other locations of a duplication finding", () => {
    const duplication = { file: "src/b.ts", range: { start: 1, end: 9 }, related: [{ file: "src/a.ts", range: { start: 11, end: 19 } }] };
    expect(overlapsChangedLines(duplication, changed)).toBe(true);
    expect(overlapsChangedLines({ ...duplication, related: [{ file: "src/a.ts", range: { start: 13, end: 19 } }] }, changed)).toBe(false);
  });
});
