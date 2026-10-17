import { headCommit } from "../../src/artifacts/git-workspace.js";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Started } from "../../src/orchestrator/begin.js";
import { readSession, recordAttemptsUsed, updateSession } from "../../src/orchestrator/session.js";
import { attemptsOf } from "../../src/orchestrator/state-attempts.js";
import { gitIn } from "./git-fixture.js";
import { loopProject } from "./loop-fixture.js";
import { printedRejectionOf, rejectionOf } from "./rejection-fixture.js";
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
      run: async () => rejectionOf("2 lint errors"),
      whenExhausted: ({ failed, attempts }) => ({ left: failed, attempts }),
    });
    expect({ result, asked, errors: emitted.filter((event) => event.type === "error").length }).toEqual({ result: { left: "2 lint errors", attempts: 1 }, asked: [], errors: 0 });
  });

  const startedIn = (project: string, emitted: { type: string }[] = []) => ({ cwd: project, runId: "run-1", bus: { emit: (event: { type: string }) => (emitted.push(event), undefined) }, workspace: { path: project, branch: "oid/run-1", startCommit: headCommit(project) }, targets: ["FR-A-01"] }) as unknown as Started;
  const servicesOf = (project: string) => ({ input: { isTTY: false as const }, configDir: project }) as never;

  it("record the attempts a rejection used and the reason, for the attempt that follows, and forget them once a state is accepted", async () => {
    const project = loopProject();
    const config = JSON.parse(readFileSync(join(project, ".outside-in.json"), "utf8"));
    writeFileSync(join(project, ".outside-in.json"), JSON.stringify({ ...config, limits: { max_retries: 2 } }));
    gitIn(project, "checkout", "--quiet", "-b", "oid/run-1");
    updateSession(project, { runId: "run-1", state: "TDD_RED" });
    const saved: unknown[] = [];
    await attemptsOf(startedIn(project), servicesOf(project), {
      state: "TDD_RED",
      role: "tdd-agent",
      label: "Add a line",
      run: async ({ attempt }) => (attempt === 1 ? rejectionOf("no test") : (saved.push(readSession(project)?.attemptsUsed), "accepted")),
    });
    expect(saved).toEqual([{ state: "TDD_RED", label: "Add a line", used: 1, reason: printedRejectionOf("no test") }]);
    expect(readSession(project)?.attemptsUsed).toBeUndefined();
  });

  it("start a state that was interrupted at the attempt after the last rejection, with its reason", async () => {
    const project = loopProject();
    updateSession(project, { runId: "run-1", state: "TDD_RED" });
    recordAttemptsUsed(project, { state: "TDD_RED", label: "Add a line", used: 1, reason: "no test" });
    const told: { attempt: number; note: string }[] = [];
    const result = await attemptsOf(startedIn(project), servicesOf(project), { state: "TDD_RED", role: "tdd-agent", label: "Add a line", run: async ({ attempt, note }) => (told.push({ attempt, note }), "accepted") });
    expect(result).toBe("accepted");
    expect(told).toHaveLength(1);
    expect(told[0]!.attempt).toBe(2);
    expect(told[0]!.note).toContain("no test");
  });

  it("ignore the attempts that another state or scenario used", async () => {
    const project = loopProject();
    updateSession(project, { runId: "run-1", state: "TDD_RED" });
    recordAttemptsUsed(project, { state: "TDD_RED", label: "Remove a line", used: 1, reason: "no test" });
    const told: number[] = [];
    await attemptsOf(startedIn(project), servicesOf(project), { state: "TDD_RED", role: "tdd-agent", label: "Add a line", run: async ({ attempt }) => (told.push(attempt), "accepted") });
    expect({ told, cleared: readSession(project)?.attemptsUsed }).toEqual({ told: [1], cleared: undefined });
  });
});
