import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEventBus } from "../../src/events/bus.js";
import { decideRed } from "../../src/orchestrator/red-decision.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

const FAILURE = { label: 'FR-A-01 "Pay"', reason: "the test failed with an error that is not an assertion", message: "Error: boom\n    at World.<anonymous> (/p/features/steps/a.steps.ts:3:9)" };

describe("the decision about a Red oid cannot classify", () => {
  it("saves the question with its three actions and ends the process with exit code 3 when nobody can answer", async () => {
    const printed: string[] = [];
    const bus = createEventBus({ cwd: dir, runId: "run-1", write: (text) => printed.push(text), now: () => 0 });
    const result = await decideRed(bus, { isTTY: false }, FAILURE);
    const saved = JSON.parse(readFileSync(join(dir, ".outside-in/session.json"), "utf8"));
    expect({ result, id: saved.pendingInput.id, actions: saved.pendingInput.actions.map((action: { key: string }) => action.key) }).toEqual({ result: 3, id: "bdd-red-decision", actions: ["valid", "bug", "trace"] });
    expect(saved.pendingInput.prompt).toContain('FR-A-01 "Pay"');
    expect(saved.pendingInput.prompt).toContain("Error: boom");
    expect(saved.pendingInput.prompt).not.toContain("at World");
  });

  it("shows the whole failure when the person asks for the trace, and accepts the Red when the person says it is valid", async () => {
    const bus = createEventBus({ cwd: dir, runId: "run-1", write: () => undefined, now: () => 0 });
    const answers = ["trace", "valid"];
    const asked: { prompt: string; actions: string[] }[] = [];
    const input = { isTTY: true as const, choose: async (prompt: string, actions: string[]) => (asked.push({ prompt, actions }), answers.shift()!), line: async () => "" };
    const result = await decideRed(bus, input, FAILURE);
    expect({ result, actions: asked.map((question) => question.actions), stack: asked.map((question) => question.prompt.includes("at World.<anonymous>")) }).toEqual({
      result: "valid",
      actions: [["valid", "bug", "trace"], ["valid", "bug", "trace"]],
      stack: [false, true],
    });
  });

  it("shows the detail of the failure after its message in the first question and in the one about the trace", async () => {
    const bus = createEventBus({ cwd: dir, runId: "run-1", write: () => undefined, now: () => 0 });
    const answers = ["trace", "valid"];
    const asked: string[] = [];
    const input = { isTTY: true as const, choose: async (prompt: string) => (asked.push(prompt), answers.shift()!), line: async () => "" };
    await decideRed(bus, input, { ...FAILURE, detail: "failing step: features/a.feature:5 When it is shouted\noutput the scenario recorded:\n  the cart refused the line" });
    expect(asked.map((prompt) => prompt.split("\n").slice(-3))).toEqual([
      ["failing step: features/a.feature:5 When it is shouted", "output the scenario recorded:", "  the cart refused the line"],
      ["failing step: features/a.feature:5 When it is shouted", "output the scenario recorded:", "  the cart refused the line"],
    ]);
  });

  it("ends the run with an error that names the Red when the person says it is a bug, or answers with something that is not an action", async () => {
    const outcome = async (answer: string) => {
      const printed: string[] = [];
      const bus = createEventBus({ cwd: dir, runId: "run-1", write: (text) => printed.push(text), now: () => 0 });
      const answers = [answer];
      const result = await decideRed(bus, { isTTY: true, choose: async () => answers.shift() ?? "valid", line: async () => "" }, FAILURE);
      return { result, printed };
    };
    expect(await outcome("bug")).toEqual({ result: 1, printed: ['error: FR-A-01 "Pay": the failure is a bug in the step definitions, as the person decided\n'] });
    expect(await outcome("maybe")).toEqual({ result: 1, printed: ['error: FR-A-01 "Pay": "maybe" is not an answer: use valid, bug or trace\n'] });
  });
});
