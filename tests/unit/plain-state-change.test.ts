import { describe, expect, it } from "vitest";
import { plainLine } from "../../src/ui/plain.js";

describe("plain line of a state change", () => {
  it("names no feature when the change belongs to none", () => {
    const line = plainLine({ ts: 1, runId: "run-1", type: "state_change", from: "PREFLIGHT", to: "BASELINE", reason: "lock acquired" });
    expect(line).toBe("[PREFLIGHT -> BASELINE] lock acquired");
  });

  it("joins the lines of a reason into the same line", () => {
    const line = plainLine({ ts: 1, runId: "run-1", type: "state_change", from: "BDD_RED", to: "TDD_RED", reason: "first line\nsecond line", fr: "FR-CART-01" });
    expect(line).toBe("[BDD_RED -> TDD_RED] FR-CART-01: first line | second line");
  });
});
