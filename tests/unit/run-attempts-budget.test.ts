import { describe, expect, it } from "vitest";
import { runAttempts } from "../../src/orchestrator/attempts.js";
import type { OIEventBody } from "../../src/events/types.js";

const MODELS = { fast: "p/small", default: "p/medium", strong: "p/large" };

function setup() {
  const log: string[] = [];
  return { log, bus: { emit: (event: OIEventBody) => void log.push(`${event.type}:${"attempt" in event ? event.attempt : ""}`) } };
}

describe("runAttempts and the budget", () => {
  it("settles the budget before it announces each attempt, and announces nothing when the budget stops the run", async () => {
    const { bus, log } = setup();
    const spec = { bus, state: "TDD_RED", role: "tdd-agent", retries: 1, models: MODELS, restore: () => {} };
    await runAttempts({ ...spec, beforeCall: async () => void log.push("budget"), run: async ({ attempt }) => (log.push("run"), attempt === 1 ? { rejected: "no" } : { value: 2 }) });
    expect(log).toEqual(["budget", "agent_start:1", "run", "attempt_rejected:1", "budget", "agent_start:2", "run"]);
    log.length = 0;
    const stopped = runAttempts({ ...spec, beforeCall: async () => Promise.reject(new Error("budget")), run: async () => (log.push("run"), { value: 1 }) });
    await expect(stopped).rejects.toThrow("budget");
    expect(log).toEqual([]);
  });

  it("hands the attempt a way to announce itself again, with the same attempt number and the same effort, for a session that runs again", async () => {
    const { bus, log } = setup();
    const events: OIEventBody[] = [];
    const recording = { emit: (event: OIEventBody) => void (bus.emit(event), events.push(event)) };
    await runAttempts({ bus: recording, state: "TDD_RED", role: "tdd-agent", retries: 2, models: MODELS, restore: () => {}, run: async (info) => ((info as { announce?: () => void }).announce?.(), { value: 1 }) });
    expect(log).toEqual(["agent_start:1", "agent_start:1"]);
    expect(events[1]).toEqual(events[0]);
  });
});
