import { describe, expect, it } from "vitest";
import { findingKey } from "../../src/artifacts/baseline.js";

describe("findingKey", () => {
  it("keeps a complexity finding the same when its lines and its measured numbers change, and tells it from another function", () => {
    const complexity = (symbol: string, start: number, detail: string) => ({ category: "complexity" as const, file: "src/a.ts", range: { start, end: start + 9 }, symbol, detail });
    const before = complexity("total", 3, "cyclomatic complexity 12 > 10");
    expect(findingKey(complexity("total", 40, "cyclomatic complexity 14 > 10"))).toBe(findingKey(before));
    expect(findingKey(complexity("count", 3, "cyclomatic complexity 12 > 10"))).not.toBe(findingKey(before));
    expect(findingKey(complexity("total", 3, "cognitive complexity 12 > 10"))).not.toBe(findingKey(before));
  });

  it("keeps the numbers of the detail for the other categories, and ignores the lines", () => {
    const magic = (file: string, start: number, detail: string) => ({ category: "magic_value" as const, file, range: { start, end: start }, detail });
    const before = magic("src/a.ts", 1, "magic number 42");
    expect(findingKey(magic("src/a.ts", 30, "magic number 42"))).toBe(findingKey(before));
    expect(findingKey(magic("src/a.ts", 1, "magic number 77"))).not.toBe(findingKey(before));
    expect(findingKey(magic("src/b.ts", 1, "magic number 42"))).not.toBe(findingKey(before));
  });

  it("keeps a duplication finding the same whichever of its two files is listed first, and tells it by its files and its number of lines", () => {
    const duplication = (file: string, other: string, lines: number, start: number) => ({
      category: "duplication" as const,
      file,
      range: { start, end: start + lines - 1 },
      detail: `${lines} duplicated lines`,
      related: [{ file: other, range: { start: 20, end: 20 + lines - 1 } }],
    });
    const before = duplication("src/invoices.ts", "src/orders.ts", 9, 1);
    expect(findingKey(duplication("src/orders.ts", "src/invoices.ts", 9, 14))).toBe(findingKey(before));
    expect(findingKey(duplication("src/invoices.ts", "src/orders.ts", 12, 1))).not.toBe(findingKey(before));
    expect(findingKey(duplication("src/invoices.ts", "src/names.ts", 9, 1))).not.toBe(findingKey(before));
  });
});
