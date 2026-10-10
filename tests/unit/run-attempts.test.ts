import { describe, expect, it } from "vitest";
import { announceAgent, runAttempts } from "../../src/orchestrator/attempts.js";
import type { OIEventBody } from "../../src/events/types.js";

const MODELS = { fast: "p/small", default: "p/medium", strong: "p/large" };

function setup() {
  const events: OIEventBody[] = [];
  return { events, bus: { emit: (event: OIEventBody) => void events.push(event) } };
}

/** The events that announce the start of an attempt. */
const starts = (events: OIEventBody[]): OIEventBody[] => events.filter((event) => event.type === "agent_start");

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
    expect(starts(events).map((event) => (event as { thinkingLevel: string }).thinkingLevel)).toEqual(["medium", "high"]);
  });

  it("gives back the last reason and the number of attempts when the retries run out, keeping the last attempt's work", async () => {
    const { bus, events } = setup();
    let restored = 0;
    const result = await runAttempts({ bus, state: "BDD_RED", role: "bdd-agent", retries: 1, models: MODELS, restore: () => void (restored += 1), run: async ({ attempt }) => ({ rejected: `reason ${attempt}` }) });
    expect(result).toEqual({ rejected: "reason 2", attempts: 2 });
    expect(restored).toBe(1);
    expect(starts(events).map((event) => (event as { model: string }).model)).toEqual(["p/medium", "p/large"]);
  });

  it("tells the next attempt that it starts again from the last checkpoint and why the attempt before it was rejected", async () => {
    const { bus } = setup();
    const notes: string[] = [];
    await runAttempts({ bus, state: "BDD_RED", role: "bdd-agent", retries: 1, models: MODELS, restore: () => {}, run: async ({ attempt, note }) => (notes.push(note), attempt === 1 ? { rejected: "the steps do not run" } : { value: 1 }) });
    expect(notes).toEqual([
      "",
      "This is attempt 2. It starts again from the last checkpoint: the files of the attempt before it were discarded, so write everything this task needs. That attempt was rejected because: the steps do not run",
    ]);
  });

  it("announces each rejected attempt with its reason before the next one starts, and the last one too", async () => {
    const { bus, events } = setup();
    await runAttempts({ bus, state: "BDD_RED", role: "bdd-agent", retries: 1, models: MODELS, restore: () => {}, run: async ({ attempt }) => ({ rejected: `reason ${attempt}` }) });
    expect(events.map((event) => (event.type === "agent_start" || event.type === "attempt_rejected" ? `${event.type} ${event.attempt}` : event.type))).toEqual([
      "agent_start 1",
      "attempt_rejected 1",
      "agent_start 2",
      "attempt_rejected 2",
    ]);
    expect(events.filter((event) => event.type === "attempt_rejected")).toEqual([
      { type: "attempt_rejected", state: "BDD_RED", role: "bdd-agent", attempt: 1, reason: "reason 1" },
      { type: "attempt_rejected", state: "BDD_RED", role: "bdd-agent", attempt: 2, reason: "reason 2" },
    ]);
  });

  it("runs one more attempt with the note of the person, on the strong model", async () => {
    const { bus, events } = setup();
    const notes: string[] = [];
    const result = await runAttempts({ bus, state: "TDD_RED", role: "tdd-agent", retries: 1, models: MODELS, restore: () => {}, afterAsking: { attempt: 3, note: "use countLines" }, run: async ({ note }) => (notes.push(note), { rejected: "still no test" }) });
    expect(result).toEqual({ rejected: "still no test", attempts: 3 });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("attempt 3");
    expect(notes[0]).toContain("use countLines");
    expect(starts(events)).toEqual([{ type: "agent_start", state: "TDD_RED", role: "tdd-agent", attempt: 3, model: "p/large", thinkingLevel: "high" }]);
  });
});
