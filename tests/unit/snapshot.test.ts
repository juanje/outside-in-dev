import { describe, expect, it } from "vitest";
import type { Finding } from "../../src/artifacts/findings.js";
import { buildSnapshot, renderTrend, type Snapshot } from "../../src/artifacts/snapshot.js";

const finding = (id: string, category: Finding["category"]): Finding => ({ id, category, file: "src/a.ts", range: { start: 1, end: 1 }, detail: "x" });

describe("buildSnapshot", () => {
  it("counts the findings of each of the five categories, zeros included, and stamps the date", () => {
    const findings = [finding("cx-0001", "complexity"), finding("magic-0001", "magic_value"), finding("magic-0002", "magic_value")];
    const snapshot = buildSnapshot(findings, { source: new Map(), tests: new Map() }, new Date("2026-10-06T12:30:00.000Z"));
    expect(snapshot.date).toBe("2026-10-06T12:30:00.000Z");
    expect(snapshot.counts).toEqual({ complexity: 1, dead_code: 0, doc_drift: 0, duplication: 0, magic_value: 2 });
  });

  it("gives the percentage of the lines of the source files and of the test files that duplication findings cover, to one decimal", () => {
    const duplication = (file: string, other: string): Finding => ({
      id: "dup-0001",
      category: "duplication",
      file,
      range: { start: 1, end: 9 },
      detail: "9 duplicated lines",
      related: [{ file: other, range: { start: 1, end: 9 } }],
    });
    const scanned = {
      source: new Map([["src/a.ts", 9], ["src/b.ts", 9], ["src/c.ts", 2]]),
      tests: new Map([["tests/unit/a.test.ts", 9], ["tests/unit/b.test.ts", 9], ["tests/unit/c.test.ts", 3]]),
    };
    const findings = [duplication("src/a.ts", "src/b.ts"), duplication("tests/unit/a.test.ts", "tests/unit/b.test.ts")];
    expect(buildSnapshot(findings, scanned, new Date(0)).duplication).toEqual({ source: 90, tests: 85.7 });
  });
});

describe("renderTrend", () => {
  const snapshot = (counts: Partial<Snapshot["counts"]>, duplication = { source: 0, tests: 0 }): Snapshot => ({
    date: "2026-10-06T12:30:00.000Z",
    counts: { complexity: 0, dead_code: 0, doc_drift: 0, duplication: 0, magic_value: 0, ...counts },
    duplication,
  });

  it("says it is the first snapshot when there is no previous one", () => {
    expect(renderTrend(undefined, snapshot({}))).toEqual(["trend: first snapshot"]);
  });

  it("says nothing changed when the counts and the percentages are the same", () => {
    const same = snapshot({ magic_value: 2 }, { source: 1.5, tests: 0 });
    expect(renderTrend(same, { ...same, date: "2026-10-07T08:00:00.000Z" })).toEqual(["trend: no change"]);
  });

  it("gives one line for each category whose count changed and each duplication percentage that changed", () => {
    const previous = snapshot({ complexity: 5, magic_value: 35 }, { source: 0, tests: 4 });
    const current = snapshot({ complexity: 4, dead_code: 2, magic_value: 35 }, { source: 12.5, tests: 4 });
    expect(renderTrend(previous, current)).toEqual([
      "trend: complexity 5 → 4",
      "trend: dead_code 0 → 2",
      "trend: duplication of source files 0.0% → 12.5%",
    ]);
  });
});
