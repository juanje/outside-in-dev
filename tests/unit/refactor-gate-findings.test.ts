import { describe, expect, it } from "vitest";
import type { FindingDraft } from "../../src/artifacts/findings.js";
import { findingProblems } from "../../src/orchestrator/refactor-gate.js";

const magic: FindingDraft = { category: "magic_value", file: "src/cart.ts", range: { start: 2, end: 4 }, detail: "the number 100" };
const unused: FindingDraft = { category: "dead_code", file: "src/cart.ts", range: { start: 6, end: 9 }, symbol: "countCartLines", detail: "unused export" };
const moved: FindingDraft = { ...magic, range: { start: 7, end: 9 } };

describe("the findings after a refactor", () => {
  it("name a listed finding that is still there, wherever its lines moved, and a finding that was not there before", () => {
    expect(findingProblems([magic], [magic], [moved, unused])).toEqual([
      "the finding is still there: magic_value src/cart.ts:7-9 the number 100",
      "a new finding: dead_code src/cart.ts:6-9 [countCartLines] unused export",
    ]);
  });

  it("are none when the listed findings are gone and the rest was already there", () => {
    expect(findingProblems([magic], [magic, unused], [unused])).toEqual([]);
  });
});
