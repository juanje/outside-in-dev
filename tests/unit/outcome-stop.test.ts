import { describe, expect, it } from "vitest";
import { outcomeStop } from "../../src/orchestrator/agent-run.js";

describe("outcomeStop", () => {
  it("rejects the attempt of an agent that failed, with the sentence of the label", () => {
    expect(outcomeStop("FR-A-01", { status: "failed", reason: "the agent produced nothing" })).toEqual({
      failed: "FR-A-01: the agent failed: the agent produced nothing",
      evidence: "the session of the agent ended with the status failed and no report",
      next: "do the task and end by calling the report tool once, with status done, or with status blocked and the reason",
    });
  });

  it("stops the run for an agent that is blocked, and for a provider that failed", () => {
    expect(outcomeStop("FR-A-01", { status: "blocked", reason: "spec_gap", detail: "no payment service" })).toEqual({ stop: "FR-A-01: the agent is blocked (spec_gap): no payment service" });
    expect(outcomeStop("FR-A-01", { status: "ask", reason: "the provider failed", detail: "bad key" })).toEqual({ stop: "FR-A-01: the provider failed: bad key" });
  });
});
