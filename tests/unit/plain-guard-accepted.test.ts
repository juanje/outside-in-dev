import { describe, expect, it } from "vitest";
import { plainLine } from "../../src/ui/plain.js";

describe("plainLine of an accepted guard", () => {
  it("prints the requirement, the scenario and the reason of the person on one line", () => {
    expect(plainLine({ ts: 0, runId: "run-1", type: "guard_accepted", fr: "FR-A-01", scenario: "Nothing is invoked", reason: "no command\nis configured" })).toBe(
      'guard accepted: FR-A-01 "Nothing is invoked": no command | is configured',
    );
  });
});
