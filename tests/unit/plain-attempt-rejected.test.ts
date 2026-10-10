import { describe, expect, it } from "vitest";
import { plainLine } from "../../src/ui/plain.js";

const rejected = (reason: string) => plainLine({ ts: 0, runId: "run-1", type: "attempt_rejected", state: "BDD_RED", role: "bdd-agent", attempt: 1, reason });

describe("plainLine of a rejected attempt", () => {
  it("prints the state, the attempt and the reason on one line", () => {
    expect(rejected('FR-A-01 "Pay": the person judged the failure to be a bug in the step definitions\nthe failure: Error: boom')).toBe(
      '[BDD_RED] attempt 1 rejected: FR-A-01 "Pay": the person judged the failure to be a bug in the step definitions | the failure: Error: boom',
    );
  });

  it("keeps the first 300 characters of a longer reason and marks the cut", () => {
    expect(rejected(`${"a".repeat(300)}${"b".repeat(200)}`)).toBe(`[BDD_RED] attempt 1 rejected: ${"a".repeat(300)}…`);
    expect(rejected("c".repeat(300))).toBe(`[BDD_RED] attempt 1 rejected: ${"c".repeat(300)}`);
  });
});
