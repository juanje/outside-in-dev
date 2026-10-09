import { describe, expect, it } from "vitest";
import { announceAgent, runAttempts } from "../../src/orchestrator/attempts.js";
import type { OIEventBody } from "../../src/events/types.js";

const MODELS = { fast: "p/small", default: "p/medium", strong: "p/large" };

function setup() {
  const events: OIEventBody[] = [];
  return { events, bus: { emit: (event: OIEventBody) => void events.push(event) } };
}

describe("announceAgent", () => {
  it("announces an agent that is not retried as its first attempt and returns the effort to run it with", () => {
    const { bus, events } = setup();
    const effort = announceAgent(bus, { state: "REFACTOR", role: "coder-agent", models: MODELS });
    expect(effort).toEqual({ model: "p/medium", thinkingLevel: "medium" });
    expect(events).toEqual([{ type: "agent_start", state: "REFACTOR", role: "coder-agent", attempt: 1, model: "p/medium", thinkingLevel: "medium" }]);
  });
});

describe("runAttempts", () => {
  it("runs the first attempt with the effort of attempt 1 and announces it", async () => {
    const { bus, events } = setup();
    const result = await runAttempts({ bus, state: "TDD_RED", role: "tdd-agent", retries: 2, models: MODELS, restore: () => {}, run: async ({ attempt, note }) => ({ value: `${attempt}:${note}` }) });
    expect(result).toEqual({ value: "1:" });
    expect(events).toEqual([{ type: "agent_start", state: "TDD_RED", role: "tdd-agent", attempt: 1, model: "p/medium", thinkingLevel: "medium" }]);
  });

  it("restores the checkpoint and runs the next attempt with the reason and a higher level after a rejection", async () => {
    const { bus, events } = setup();
    let restored = 0;
    const notes: string[] = [];
    const result = await runAttempts({
      bus,
      state: "CODE_GREEN",
      role: "coder-agent",
      retries: 3,
      models: MODELS,
      restore: () => void (restored += 1),
      run: async ({ attempt, note }) => {
        notes.push(note);
        return attempt === 1 ? { rejected: "the unit test still fails" } : { value: "done" };
      },
    });
    expect(result).toEqual({ value: "done" });
    expect(restored).toBe(1);
    expect(notes[1]).toContain("attempt 2");
    expect(notes[1]).toContain("the unit test still fails");
    expect(events.map((event) => (event as { thinkingLevel: string }).thinkingLevel)).toEqual(["medium", "high"]);
  });

  it("gives back the last reason and the number of attempts when the retries run out, keeping the last attempt's work", async () => {
    const { bus, events } = setup();
    let restored = 0;
    const result = await runAttempts({ bus, state: "BDD_RED", role: "bdd-agent", retries: 1, models: MODELS, restore: () => void (restored += 1), run: async ({ attempt }) => ({ rejected: `reason ${attempt}` }) });
    expect(result).toEqual({ rejected: "reason 2", attempts: 2 });
    expect(restored).toBe(1);
    expect(events.map((event) => (event as { model: string }).model)).toEqual(["p/medium", "p/large"]);
  });

  it("runs one more attempt with the note of the person, on the strong model", async () => {
    const { bus, events } = setup();
    const notes: string[] = [];
    const result = await runAttempts({ bus, state: "TDD_RED", role: "tdd-agent", retries: 1, models: MODELS, restore: () => {}, afterAsking: { attempt: 3, note: "use countLines" }, run: async ({ note }) => (notes.push(note), { rejected: "still no test" }) });
    expect(result).toEqual({ rejected: "still no test", attempts: 3 });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("attempt 3");
    expect(notes[0]).toContain("use countLines");
    expect(events).toEqual([{ type: "agent_start", state: "TDD_RED", role: "tdd-agent", attempt: 3, model: "p/large", thinkingLevel: "high" }]);
  });
});
