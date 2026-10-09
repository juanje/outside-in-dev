import { describe, expect, it } from "vitest";
import { plainLine } from "../../src/ui/plain.js";

describe("plainLine of an agent start", () => {
  it("prints the state, the attempt, the model and the thinking level", () => {
    const line = plainLine({ ts: 0, runId: "run-1", type: "agent_start", state: "TDD_RED", role: "tdd-agent", attempt: 2, model: "p/medium", thinkingLevel: "high" });
    expect(line).toBe("[TDD_RED] tdd-agent attempt 2 (model p/medium, thinking high)");
  });
});
