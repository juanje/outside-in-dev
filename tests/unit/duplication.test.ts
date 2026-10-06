import { describe, expect, it } from "vitest";
import { duplicationFindings } from "../../src/artifacts/duplication.js";

const ROOT = "/work/project";

/** The shape of a clone in the JSON report of jscpd 5.4.0 (`duplicates[]`), recorded from a real run with `--absolute`. */
function recordedClone(first: [string, number, number], second: [string, number, number], lines: number) {
  const part = ([name, start, end]: [string, number, number]) => ({
    end,
    endLoc: { column: 1, line: end, position: 202 },
    name,
    start,
    startLoc: { column: 21, line: start, position: 21 },
  });
  return {
    firstFile: part(first),
    format: "typescript",
    fragment: "export function total(items: number[]): number {\n  let sum = 0;\n  …",
    isNew: false,
    kind: "exact",
    lines,
    secondFile: part(second),
    tokens: 52,
  };
}

describe("duplicationFindings", () => {
  it("turns a clone of the jscpd report into a finding with both locations, relative to the project", () => {
    const report = { duplicates: [recordedClone([`${ROOT}/src/a.ts`, 1, 9], [`${ROOT}/src/b.ts`, 3, 11], 9)], statistics: {} };
    expect(duplicationFindings(report, ROOT)).toEqual([
      {
        category: "duplication",
        file: "src/a.ts",
        range: { start: 1, end: 9 },
        detail: "9 duplicated lines",
        related: [{ file: "src/b.ts", range: { start: 3, end: 11 } }],
      },
    ]);
  });

  it("puts the part that comes first by file and line first, whatever the order jscpd reported", () => {
    const report = {
      duplicates: [
        recordedClone([`${ROOT}/src/b.ts`, 3, 11], [`${ROOT}/src/a.ts`, 1, 9], 9),
        recordedClone([`${ROOT}/src/c.ts`, 20, 28], [`${ROOT}/src/c.ts`, 2, 10], 9),
      ],
    };
    expect(duplicationFindings(report, ROOT).map(({ file, range, related }) => [file, range.start, related?.[0]?.file, related?.[0]?.range.start])).toEqual([
      ["src/a.ts", 1, "src/b.ts", 3],
      ["src/c.ts", 2, "src/c.ts", 20],
    ]);
  });
});
