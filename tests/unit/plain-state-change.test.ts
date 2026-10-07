import { describe, expect, it } from "vitest";
import { plainLine } from "../../src/ui/plain.js";

describe("plain line of a state change", () => {
  it("names no feature when the change belongs to none", () => {
    const line = plainLine({ ts: 1, runId: "run-1", type: "state_change", from: "PREFLIGHT", to: "BASELINE", reason: "lock acquired" });
    expect(line).toBe("[PREFLIGHT -> BASELINE] lock acquired");
  });
});
