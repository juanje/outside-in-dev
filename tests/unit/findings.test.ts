import { describe, expect, it } from "vitest";
import { formatFinding, numberFindings, renderReport } from "../../src/artifacts/findings.js";

describe("numberFindings", () => {
  it("orders drafts by category, file and start line and numbers them per category", () => {
    const draft = (file: string, start: number) => ({
      category: "complexity" as const,
      file,
      range: { start, end: start + 2 },
      symbol: `f${start}`,
      detail: "cyclomatic complexity 3 > 2",
    });
    const findings = numberFindings([draft("src/b.ts", 1), draft("src/a.ts", 5), draft("src/a.ts", 1)]);
    expect(findings.map(({ id, file, range }) => [id, file, range.start])).toEqual([
      ["cx-0001", "src/a.ts", 1],
      ["cx-0002", "src/a.ts", 5],
      ["cx-0003", "src/b.ts", 1],
    ]);
  });

  it("orders files by code point, whatever the locale", () => {
    const draft = (file: string) => ({ category: "complexity" as const, file, range: { start: 1, end: 2 }, detail: "d" });
    const findings = numberFindings([draft("src/a.ts"), draft("src/B.ts")]);
    expect(findings.map(({ file }) => file)).toEqual(["src/B.ts", "src/a.ts"]);
  });
});

describe("formatFinding", () => {
  it("prints category, file with lines, symbol in brackets and detail on one line", () => {
    const finding = {
      id: "cx-0001",
      category: "complexity" as const,
      file: "src/classify.ts",
      range: { start: 1, end: 14 },
      symbol: "classify",
      detail: "cyclomatic complexity 12 > 10",
    };
    expect(formatFinding(finding)).toBe("complexity src/classify.ts:1-14 [classify] cyclomatic complexity 12 > 10");
  });

  it("leaves out the brackets when the finding has no symbol", () => {
    const finding = { id: "cx-0001", category: "complexity" as const, file: "src/a.ts", range: { start: 3, end: 4 }, detail: "d" };
    expect(formatFinding(finding)).toBe("complexity src/a.ts:3-4 d");
  });
});

describe("renderReport", () => {
  const finding = (id: string, start: number) => ({
    id,
    category: "complexity" as const,
    file: "src/a.ts",
    range: { start, end: start + 1 },
    symbol: `f${start}`,
    detail: "d",
  });

  it("prints one line per finding, then the count of the category", () => {
    expect(renderReport([finding("cx-0001", 1), finding("cx-0002", 5)])).toBe(
      "complexity src/a.ts:1-2 [f1] d\ncomplexity src/a.ts:5-6 [f5] d\ncomplexity 2\n",
    );
  });

  it("says there are no findings instead of printing counts", () => {
    expect(renderReport([])).toBe("no findings\n");
  });
});
