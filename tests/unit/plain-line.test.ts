import { describe, expect, it } from "vitest";
import { plainLine } from "../../src/ui/plain.js";

describe("plainLine", () => {
  it("prints a state change with its states, requirement and reason", () => {
    const line = plainLine({ ts: 0, runId: "run-1", type: "state_change", from: "BDD_RED", to: "TDD_RED", reason: "scenario is red", fr: "FR-CART-01" });
    expect(line).toBe("[BDD_RED -> TDD_RED] FR-CART-01: scenario is red");
  });

  it("prints an error message after the word error", () => {
    expect(plainLine({ ts: 0, runId: "run-1", type: "error", message: "agent timed out" })).toBe("error: agent timed out");
  });

  it("joins the lines of an error detail into the same line", () => {
    const line = plainLine({ ts: 0, runId: "run-1", type: "error", message: "agent timed out", detail: "first line\nsecond line" });
    expect(line).toBe("error: agent timed out | first line | second line");
  });

  it("joins the lines of a question into the same line", () => {
    const request = { id: "request-1", prompt: "Accept this failure?\nexpected 1 but got 2", actions: [{ key: "approve", label: "Approve" }] };
    expect(plainLine({ ts: 0, runId: "run-1", type: "waiting_input", request })).toBe("waiting for input: Accept this failure? | expected 1 but got 2 [approve]");
  });

  it("prints a question with the keys of its actions", () => {
    const request = { id: "request-1", prompt: "Accept the ambiguous Red?", actions: [{ key: "approve", label: "Approve" }, { key: "reject", label: "Reject" }] };
    expect(plainLine({ ts: 0, runId: "run-1", type: "waiting_input", request })).toBe("waiting for input: Accept the ambiguous Red? [approve, reject]");
  });
});
