import { describe, expect, it } from "vitest";
import { findingRecord } from "../../src/artifacts/baseline.js";

describe("findingRecord", () => {
  it("is the category, the file, the symbol when there is one and the detail, with no line", () => {
    const magic = { category: "magic_value" as const, file: "src/a.ts", range: { start: 4, end: 4 }, detail: "magic number 42" };
    expect(findingRecord(magic)).toStrictEqual({ category: "magic_value", file: "src/a.ts", detail: "magic number 42" });
    expect(findingRecord({ ...magic, category: "doc_drift", symbol: "total" })).toStrictEqual({ category: "doc_drift", file: "src/a.ts", symbol: "total", detail: "magic number 42" });
  });

  it("replaces every number of a complexity detail by N and keeps the numbers of the other categories", () => {
    const complexity = { category: "complexity" as const, file: "src/a.ts", range: { start: 3, end: 12 }, symbol: "total", detail: "cyclomatic complexity 12 > 10; nesting depth 5 > 4" };
    expect(findingRecord(complexity)).toStrictEqual({ category: "complexity", file: "src/a.ts", symbol: "total", detail: "cyclomatic complexity N > N; nesting depth N > N" });
    expect(findingRecord({ ...complexity, category: "magic_value" }).detail).toBe(complexity.detail);
  });

  it("lists the files of a duplication, sorted, in place of its file", () => {
    const duplication = { category: "duplication" as const, file: "src/orders.ts", range: { start: 1, end: 9 }, detail: "9 duplicated lines", related: [{ file: "src/invoices.ts", range: { start: 14, end: 22 } }] };
    expect(findingRecord(duplication)).toStrictEqual({ category: "duplication", files: ["src/invoices.ts", "src/orders.ts"], detail: "9 duplicated lines" });
  });
});
