import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEventBus } from "../../src/events/bus.js";
import type { Redirect } from "../../src/orchestrator/redirect.js";
import { askAboutBlocked } from "../../src/orchestrator/retries-exhausted.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

const BLOCKED = { state: "CODE_GREEN", label: 'FR-A-01 "Pay"', problem: 'FR-A-01 "Pay": the agent is blocked (spec_gap): the rounding is not defined' };

const bus = () => createEventBus({ cwd: dir, runId: "run-1", write: () => {}, now: () => 1 });

describe("the question about an agent that is blocked", () => {
  it("is saved with its state, its reason and the five actions, and ends the process with exit code 3, when there is no terminal", async () => {
    const result = await askAboutBlocked(bus(), { isTTY: false }, BLOCKED);
    const pending = JSON.parse(readFileSync(join(dir, ".outside-in/session.json"), "utf8")).pendingInput;
    expect({ result, id: pending.id, prompt: pending.prompt, actions: pending.actions.map((action: { key: string }) => action.key) }).toEqual({
      result: 3,
      id: "agent-blocked",
      prompt: `CODE_GREEN: ${BLOCKED.problem}`,
      actions: ["retry", "rewrite", "rewrite_steps", "skip_scenario", "skip_fr", "abort"],
    });
  });

  it("passes the diagnosis of a wrong unit test or step to the matching rewrite, before the person's note, and to no other", async () => {
    const notes: Record<string, string> = {};
    for (const [reason, answer] of [["wrong_test", "rewrite"], ["wrong_test", "rewrite_steps"], ["wrong_step", "rewrite_steps"], ["wrong_step", "rewrite"], ["spec_gap", "rewrite"]] as const) {
      const input = { isTTY: true as const, choose: async () => answer, line: async () => "the note" };
      const blocked = { ...BLOCKED, agent: { reason, detail: "the diagnosis" } };
      notes[`${reason} ${answer}`] = await askAboutBlocked(bus(), input, blocked).then(() => "", (error: Redirect) => error.note);
    }
    expect(notes).toEqual({ "wrong_test rewrite": "the diagnosis\n\nthe note", "wrong_test rewrite_steps": "the note", "wrong_step rewrite_steps": "the diagnosis\n\nthe note", "wrong_step rewrite": "the note", "spec_gap rewrite": "the note" });
  });

  it("offers neither the rewrite of a unit test nor the skip of a scenario in the states that have no scenario or unit test of their own", async () => {
    const offered: Record<string, string[]> = {};
    for (const state of ["FEATURE_WRITE", "QUALITY_FIX"]) {
      await askAboutBlocked(bus(), { isTTY: false }, { ...BLOCKED, state });
      const pending = JSON.parse(readFileSync(join(dir, ".outside-in/session.json"), "utf8")).pendingInput;
      offered[state] = pending.actions.map((action: { key: string }) => action.key);
    }
    expect(offered).toEqual({ FEATURE_WRITE: ["retry", "skip_fr", "abort"], QUALITY_FIX: ["retry", "skip_fr", "abort"] });
  });
});
