import { describe, expect, it } from "vitest";
import type { Started } from "../../src/orchestrator/begin.js";
import { updateSession } from "../../src/orchestrator/session.js";
import { attemptsOf } from "../../src/orchestrator/state-attempts.js";
import { loopProject } from "./loop-fixture.js";
import { useTempDir } from "./temp-project.js";

useTempDir();

describe("the attempts of a state", () => {
  it("hand the last rejection to the state, with no question to the person and no error, when the state says what to do with it", async () => {
    const project = loopProject();
    updateSession(project, { state: "QUALITY_FIX" });
    const emitted: { type: string }[] = [];
    const started = { cwd: project, runId: "run-1", bus: { emit: (event: { type: string }) => (emitted.push(event), undefined) }, workspace: { path: project }, targets: ["FR-A-01"] } as unknown as Started;
    const asked: string[] = [];
    const input = { isTTY: true as const, choose: async (prompt: string) => (asked.push(prompt), "abort"), line: async () => "" };
    const result = await attemptsOf(started, { input, configDir: project } as never, {
      state: "QUALITY_FIX",
      role: "fix-agent",
      label: "FR-A-01",
      run: async () => ({ rejected: "2 lint errors" }),
      whenExhausted: ({ rejected, attempts }) => ({ left: rejected, attempts }),
    });
    expect({ result, asked, errors: emitted.filter((event) => event.type === "error").length }).toEqual({ result: { left: "2 lint errors", attempts: 1 }, asked: [], errors: 0 });
  });
});
