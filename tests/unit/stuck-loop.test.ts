import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEventBus } from "../../src/events/bus.js";
import { stuckLoop } from "../../src/orchestrator/stuck-loop.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

const STUCK = { label: 'FR-A-01 "Pay"', iterations: 2 };

function bus(printed: string[] = []) {
  return createEventBus({ cwd: dir, runId: "run-1", write: (text) => printed.push(text), now: () => 0 });
}

const FIVE_ACTIONS = ["retry", "rewrite", "skip_scenario", "skip_fr", "abort"];

describe("the question about a scenario that is still red after the last iteration", () => {
  it("asks with the five actions and moves the run to ABORTED, with exit code 2, when the person aborts", async () => {
    const asked: { prompt: string; actions: string[] }[] = [];
    const input = { isTTY: true as const, choose: async (prompt: string, actions: string[]) => (asked.push({ prompt, actions }), "abort"), line: async () => "" };
    const result = await stuckLoop(bus(), input, STUCK);
    const log = readFileSync(join(dir, ".outside-in/runs/run-1/events.jsonl"), "utf8").trimEnd().split("\n").map((line) => JSON.parse(line));
    expect({ result, actions: asked.map((question) => question.actions), prompt: asked[0]?.prompt, moved: log.map((event) => [event.type, event.from, event.to]) }).toEqual({
      result: 2,
      actions: [FIVE_ACTIONS],
      prompt: 'FR-A-01 "Pay" is still red after 2 iterations of the inner loop',
      moved: [["state_change", "BDD_CHECK", "ABORTED"]],
    });
  });

  it("is saved with the five actions and ends the process with exit code 3 when there is no terminal", async () => {
    const result = await stuckLoop(bus(), { isTTY: false }, { label: STUCK.label, iterations: 8 });
    const pending = JSON.parse(readFileSync(join(dir, ".outside-in/session.json"), "utf8")).pendingInput;
    expect({ result, id: pending.id, prompt: pending.prompt, actions: pending.actions.map((action: { key: string }) => action.key) }).toEqual({
      result: 3,
      id: "stuck-loop",
      prompt: 'FR-A-01 "Pay" is still red after 8 iterations of the inner loop',
      actions: FIVE_ACTIONS,
    });
  });

  it("ends the run with an error that says retries are not there yet, for every answer but abort", async () => {
    const outcome = async (answer: string) => {
      const printed: string[] = [];
      const result = await stuckLoop(bus(printed), { isTTY: true, choose: async () => answer, line: async () => "" }, STUCK);
      return { result, printed };
    };
    expect(await outcome("retry")).toEqual({ result: 1, printed: ['error: FR-A-01 "Pay": "retry" has to wait for retries (FR-RUN-08): only abort is possible now\n'] });
    expect((await outcome("skip_fr")).result).toBe(1);
    expect((await outcome("maybe")).printed[0]).toContain('"maybe"');
  });
});
