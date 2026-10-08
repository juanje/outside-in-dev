import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEventBus } from "../../src/events/bus.js";
import { gateQuestion } from "../../src/orchestrator/gate-question.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

const ASK = { check: "lint", problems: ["lint src/cart.ts:2 no-todo Unexpected TODO comment."], output: '[{"ruleId":"no-todo"}]' };

function bus(printed: string[] = []) {
  return createEventBus({ cwd: dir, runId: "run-1", write: (text) => printed.push(text), now: () => 0 });
}

describe("the question about a quality gate that cannot be fixed", () => {
  it("asks with view, edit and abort, shows the whole output on view and moves the run to ABORTED, with exit code 2, on abort", async () => {
    const asked: { prompt: string; actions: string[] }[] = [];
    const answers = ["view", "abort"];
    const input = { isTTY: true as const, choose: async (prompt: string, actions: string[]) => (asked.push({ prompt, actions }), answers.shift() ?? ""), line: async () => "" };
    const result = await gateQuestion(bus(), input, ASK);
    const log = readFileSync(join(dir, ".outside-in/runs/run-1/events.jsonl"), "utf8").trimEnd().split("\n").map((line) => JSON.parse(line));
    expect(result).toBe(2);
    expect(asked.map((question) => question.actions)).toEqual([["view", "edit", "abort"], ["view", "edit", "abort"]]);
    expect(asked[0]!.prompt).toBe("The quality gate failed at the lint check:\nlint src/cart.ts:2 no-todo Unexpected TODO comment.");
    expect(asked[1]!.prompt).toBe(`The quality gate failed at the lint check:\n${ASK.output}`);
    expect(log.map((event) => [event.type, event.from, event.to])).toEqual([["state_change", "QUALITY_GATE", "ABORTED"]]);
  });

  it("ends the run with an error that says resuming is not there yet, for every answer but view and abort", async () => {
    const outcome = async (answer: string) => {
      const printed: string[] = [];
      const answers = [answer, "abort"];
      const result = await gateQuestion(bus(printed), { isTTY: true, choose: async () => answers.shift() ?? "abort", line: async () => "" }, ASK);
      return { result, printed };
    };
    expect(await outcome("edit")).toEqual({ result: 1, printed: ['error: the quality gate: "edit" has to wait for resuming (FR-RUN-09): only abort is possible now\n'] });
    expect((await outcome("maybe")).printed[0]).toContain('"maybe"');
  });

  it("is saved with the three actions and ends the process with exit code 3 when there is no terminal", async () => {
    const result = await gateQuestion(bus(), { isTTY: false }, ASK);
    const pending = JSON.parse(readFileSync(join(dir, ".outside-in/session.json"), "utf8")).pendingInput;
    expect({ result, id: pending.id, prompt: pending.prompt, actions: pending.actions.map((action: { key: string }) => action.key) }).toEqual({
      result: 3,
      id: "quality-gate",
      prompt: "The quality gate failed at the lint check:\nlint src/cart.ts:2 no-todo Unexpected TODO comment.",
      actions: ["view", "edit", "abort"],
    });
  });
});
