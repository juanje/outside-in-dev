import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEventBus } from "../../src/events/bus.js";
import { askAboutGuard } from "../../src/orchestrator/guard-question.js";
import { Redirect } from "../../src/orchestrator/redirect.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

const SCENARIO = { label: 'FR-A-01 "Nothing is invoked"', steps: 'features/steps/none.steps.ts:\nThen("nothing is invoked", function () {});' };
const bus = (printed: string[] = []) => createEventBus({ cwd: dir, runId: "run-1", write: (text) => void printed.push(text), now: () => 1 });

describe("the answers other than accepting the guard", () => {
  it("hands back the note of a retry, throws the redirect of a skip with the reason, aborts the run, and is saved as a question when there is no terminal", async () => {
    const answering = (answer: string) => ({ isTTY: true as const, choose: async () => answer, line: async () => "assert the invocation" });
    const skipped = await askAboutGuard(bus(), answering("skip_scenario"), SCENARIO).catch((error: unknown) => error);
    expect(await askAboutGuard(bus(), answering("retry"), SCENARIO)).toEqual({ note: "assert the invocation" });
    expect(skipped).toBeInstanceOf(Redirect);
    expect(skipped).toMatchObject({ action: "skip_scenario", reason: "the scenario passes before any code" });
    expect(await askAboutGuard(bus(), answering("skip_fr"), SCENARIO).catch((error: unknown) => error)).toMatchObject({ action: "skip_fr" });
    expect(await askAboutGuard(bus(), answering("abort"), SCENARIO)).toBe(2);
    const printed: string[] = [];
    expect(await askAboutGuard(bus(printed), answering("maybe"), SCENARIO)).toBe(1);
    expect(printed[0]).toContain('"maybe" is not an answer');
    const pending = await askAboutGuard(bus(), { isTTY: false }, SCENARIO);
    const saved = JSON.parse(readFileSync(join(dir, ".outside-in/session.json"), "utf8")).pendingInput;
    expect({ pending, id: saved.id, actions: saved.actions.map((action: { key: string }) => action.key) }).toEqual({ pending: 3, id: "bdd-red-guard", actions: ["accept_guard", "retry", "skip_scenario", "skip_fr", "abort"] });
  });
});

describe("the question about a scenario that passes before any code", () => {
  it("shows the reason and the steps, offers the guard with the other actions, and asks for a reason until it is not empty", async () => {
    const asked: { prompt: string; actions: string[] }[] = [];
    const lines: string[] = [];
    const answers = ["", "   ", "no command is configured"];
    const input = { isTTY: true as const, choose: async (prompt: string, actions: string[]) => (asked.push({ prompt, actions }), "accept_guard"), line: async (prompt: string) => (lines.push(prompt), answers.shift()!) };
    const result = await askAboutGuard(bus(), input, SCENARIO);
    expect({ result, actions: asked.map((question) => question.actions), lines }).toEqual({
      result: { guard: "no command is configured" },
      actions: [["accept_guard", "retry", "skip_scenario", "skip_fr", "abort"]],
      lines: ["Why is this scenario a guard?", "Why is this scenario a guard?", "Why is this scenario a guard?"],
    });
    expect(asked[0]!.prompt).toContain('FR-A-01 "Nothing is invoked" passes before any code');
    expect(asked[0]!.prompt).toContain('Then("nothing is invoked"');
  });
});
