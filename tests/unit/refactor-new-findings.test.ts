import { describe, expect, it } from "vitest";
import { findingKey } from "../../src/artifacts/baseline.js";
import type { FindingDraft } from "../../src/artifacts/findings.js";
import { newFindings } from "../../src/orchestrator/refactor-findings.js";

const draft = (file: string, start: number, end: number, detail: string): FindingDraft => ({ category: "magic_value", file, range: { start, end }, detail });

describe("the new findings of a Green", () => {
  it("are those on the lines it changed that the baseline of the run does not hold", () => {
    const fresh = draft("src/cart.ts", 2, 4, "the number 100");
    const elsewhere = draft("src/totals.ts", 1, 1, "the number 7");
    const known = draft("src/cart.ts", 3, 3, "the number 42");
    const changed = new Map([["src/cart.ts", [{ start: 1, end: 9 }]]]);
    expect(newFindings([fresh, elsewhere, known], changed, new Set([findingKey(known)]))).toEqual([fresh]);
  });
});
