import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEventBus } from "../../src/events/bus.js";
import { askAfterAttempts } from "../../src/orchestrator/retries-exhausted.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

const EXHAUSTED = { state: "TDD_RED", label: 'FR-A-01 "Pay"', attempts: 3, rejected: "the report names no unit test" };
const FIVE_ACTIONS = ["retry", "rewrite", "skip_scenario", "skip_fr", "abort"];

const bus = (printed: string[] = []) => createEventBus({ cwd: dir, runId: "run-1", write: (text) => void printed.push(text), now: () => 1 });

describe("the question after the retries ran out", () => {
  it("is saved with the five actions and the last reason, and ends the process with exit code 3, when there is no terminal", async () => {
    const result = await askAfterAttempts(bus(), { isTTY: false }, EXHAUSTED);
    const pending = JSON.parse(readFileSync(join(dir, ".outside-in/session.json"), "utf8")).pendingInput;
    expect({ result, id: pending.id, prompt: pending.prompt, actions: pending.actions.map((action: { key: string }) => action.key) }).toEqual({
      result: 3,
      id: "retries-exhausted",
      prompt: 'FR-A-01 "Pay" failed 3 attempts of TDD_RED: the report names no unit test',
      actions: FIVE_ACTIONS,
    });
  });

  it("asks with the five actions and moves the run from the state to ABORTED, with exit code 2, when the person aborts", async () => {
    const asked: { prompt: string; actions: string[] }[] = [];
    const input = { isTTY: true as const, choose: async (prompt: string, actions: string[]) => (asked.push({ prompt, actions }), "abort"), line: async () => "" };
    const result = await askAfterAttempts(bus(), input, EXHAUSTED);
    const logFile = join(dir, ".outside-in/runs/run-1/events.jsonl");
    const log = existsSync(logFile) ? readFileSync(logFile, "utf8").trimEnd().split("\n").map((line) => JSON.parse(line)) : [];
    expect({ result, asked, moved: log.map((event) => [event.type, event.from, event.to]) }).toEqual({
      result: 2,
      asked: [{ prompt: 'FR-A-01 "Pay" failed 3 attempts of TDD_RED: the report names no unit test', actions: FIVE_ACTIONS }],
      moved: [["state_change", "TDD_RED", "ABORTED"]],
    });
  });

  it("asks the person for a note and hands it back when the person retries", async () => {
    const lines: string[] = [];
    const input = { isTTY: true as const, choose: async () => "retry", line: async (prompt: string) => (lines.push(prompt), "use countLines") };
    const result = await askAfterAttempts(bus(), input, EXHAUSTED);
    expect({ result, lines: lines.length }).toEqual({ result: { note: "use countLines" }, lines: 1 });
  });

  it("ends the run with an error that says the action is not implemented yet, for rewrite, skip_scenario, skip_fr and anything else", async () => {
    const outcome = async (answer: string) => {
      const printed: string[] = [];
      const result = await askAfterAttempts(bus(printed), { isTTY: true, choose: async () => answer, line: async () => "" }, EXHAUSTED);
      return { result, printed };
    };
    expect(await outcome("skip_fr")).toEqual({ result: 1, printed: ['error: FR-A-01 "Pay": "skip_fr" is not implemented yet: only retry and abort are possible now\n'] });
    expect((await outcome("rewrite")).result).toBe(1);
    expect((await outcome("maybe")).printed[0]).toContain('"maybe"');
  });
});
