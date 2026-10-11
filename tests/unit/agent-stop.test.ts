import { describe, expect, it } from "vitest";
import { Blocked } from "../../src/orchestrator/redirect.js";
import type { Started } from "../../src/orchestrator/begin.js";
import { agentStop } from "../../src/orchestrator/state-attempts.js";

const started = { bus: { emit: () => undefined } } as unknown as Started;

describe("agentStop", () => {
  it("throws what the agent said when it is blocked, for the run to put it to the person", () => {
    const stop = () => agentStop(started, 'FR-A-01 "Pay"', { status: "blocked", reason: "spec_gap", detail: "the rounding is not defined" });
    expect(stop).toThrow(Blocked);
    expect(stop).toThrow('FR-A-01 "Pay": the agent is blocked (spec_gap): the rounding is not defined');
  });
});
