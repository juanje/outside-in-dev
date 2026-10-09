import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEventBus } from "../../src/events/bus.js";
import { askAboutBudget } from "../../src/orchestrator/budget-question.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

const STOPPED = { state: "TDD_RED", reason: "the run has spent 0.06 dollars of 0.05" };
const PROMPT = "Budget exhausted at TDD_RED: the run has spent 0.06 dollars of 0.05";

const bus = (printed: string[] = []) => createEventBus({ cwd: dir, runId: "run-1", write: (text) => void printed.push(text), now: () => 1 });

describe("the question about the budget", () => {
  it("is saved with the actions extend and abort, and ends the process with exit code 3, when there is no terminal", async () => {
    const result = await askAboutBudget(bus(), { isTTY: false }, STOPPED);
    const pending = JSON.parse(readFileSync(join(dir, ".outside-in/session.json"), "utf8")).pendingInput;
    expect({ result, id: pending.id, prompt: pending.prompt, actions: pending.actions.map((action: { key: string }) => action.key) }).toEqual({ result: 3, id: "budget", prompt: PROMPT, actions: ["extend", "abort"] });
  });

  it("hands back that the person extends the limit, and moves the run nowhere", async () => {
    const printed: string[] = [];
    const result = await askAboutBudget(bus(printed), { isTTY: true, choose: async () => "extend", line: async () => "" }, STOPPED);
    expect({ result, printed: printed.filter((text) => text.includes("ABORTED")) }).toEqual({ result: "extend", printed: [] });
  });

  it("asks with extend and abort and, when the person aborts, moves the run from the state to ABORTED and returns exit code 4", async () => {
    const asked: { prompt: string; actions: string[] }[] = [];
    const input = { isTTY: true as const, choose: async (prompt: string, actions: string[]) => (asked.push({ prompt, actions }), "abort"), line: async () => "" };
    const result = await askAboutBudget(bus(), input, STOPPED);
    const log = readFileSync(join(dir, ".outside-in/runs/run-1/events.jsonl"), "utf8").trimEnd().split("\n").map((line) => JSON.parse(line));
    expect({ result, asked, moved: log.map((event) => [event.type, event.from, event.to]) }).toEqual({
      result: 4,
      asked: [{ prompt: PROMPT, actions: ["extend", "abort"] }],
      moved: [["state_change", "TDD_RED", "ABORTED"]],
    });
  });
});
