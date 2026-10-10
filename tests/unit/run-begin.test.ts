import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { beginRun } from "../../src/orchestrator/begin.js";
import { parseRunArgs } from "../../src/orchestrator/run-args.js";
import { gitIn } from "./git-fixture.js";
import { committedRunProject } from "./run-fixture.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

const environment = (printed: string[]) => ({ pid: 4242, now: new Date("2026-10-02T21:30:00Z"), suffix: "a1b2", write: (text: string) => printed.push(text) });

describe("beginning a run", () => {
  it("ends with exit code 0 and releases the lock of the project", () => {
    const project = committedRunProject();
    expect(beginRun(project, parseRunArgs([]), environment([]))).toBe(0);
    expect(existsSync(join(project, ".outside-in/lock"))).toBe(false);
  });

  it("works in a worktree named after the run, on the branch it was given", () => {
    const project = committedRunProject();
    beginRun(project, parseRunArgs(["--branch", "login"]), environment([]));
    expect(gitIn(project, "branch", "--format=%(refname:short)").split("\n")).toContain("oid/login");
    expect(existsSync(join(dir, ".oid-worktrees/project/2026-10-02T21-30-00Z-a1b2/SPEC.md"))).toBe(true);
  });

  it("logs and prints each transition of the start, from the lock to the selection", () => {
    const project = committedRunProject();
    const printed: string[] = [];
    beginRun(project, parseRunArgs([]), environment(printed));
    const log = readFileSync(join(project, ".outside-in/runs/2026-10-02T21-30-00Z-a1b2/events.jsonl"), "utf8").trimEnd().split("\n");
    expect(log.map((line) => JSON.parse(line).to)).toEqual(["PREFLIGHT", "BASELINE", "SPEC_CHECK", "SELECT_FR", "FEATURE_WRITE"]);
    expect(printed).toHaveLength(5);
  });

  it("stamps each event with the time it happens, not with the time the run started", () => {
    const project = committedRunProject();
    const before = Date.now();
    beginRun(project, parseRunArgs([]), environment([]));
    const log = readFileSync(join(project, ".outside-in/runs/2026-10-02T21-30-00Z-a1b2/events.jsonl"), "utf8").trimEnd().split("\n");
    expect(log.map((line) => JSON.parse(line).ts >= before)).toEqual(log.map(() => true));
  });

  it("saves a session that names the run, its worktree and branch and the commit it started from", () => {
    const project = committedRunProject();
    beginRun(project, parseRunArgs(["--branch", "login"]), environment([]));
    const saved = JSON.parse(readFileSync(join(project, ".outside-in/session.json"), "utf8"));
    expect(saved).toMatchObject({ runId: "2026-10-02T21-30-00Z-a1b2", branch: "oid/login", baseCommit: gitIn(project, "rev-parse", "HEAD") });
    expect(saved.worktree).toBe(join(dir, ".oid-worktrees/project/2026-10-02T21-30-00Z-a1b2"));
  });

  it("records the commit it started from and what failed in the suite as the baseline", () => {
    const project = committedRunProject({ unit: "failed", bdd: "PASSED" });
    beginRun(project, parseRunArgs([]), environment([]));
    const baseline = JSON.parse(readFileSync(join(project, ".outside-in/runs/2026-10-02T21-30-00Z-a1b2/baseline.json"), "utf8"));
    expect(baseline).toEqual({ startCommit: gitIn(project, "rev-parse", "HEAD"), unit: { failed: ["unit tests/totals.test.ts > totals > adds: boom"] }, bdd: { failed: [] } });
  });

  it("keeps the reports of the baseline run in the run directory", () => {
    const project = committedRunProject();
    beginRun(project, parseRunArgs([]), environment([]));
    const tests = join(project, ".outside-in/runs/2026-10-02T21-30-00Z-a1b2/tests");
    expect(readFileSync(join(tests, "0-unit.json"), "utf8")).toContain('"fullName":"totals > adds"');
    expect(readFileSync(join(tests, "0-bdd.ndjson"), "utf8")).toContain('"uri":"features/pay.feature"');
  });

  it("asks what to do with a red suite, ends with exit code 3 and saves the question", () => {
    const project = committedRunProject({ unit: "failed", bdd: "PASSED" });
    const printed: string[] = [];
    expect(beginRun(project, parseRunArgs([]), environment(printed))).toBe(3);
    expect(printed.at(-1)).toMatch(/^waiting for input: .*red/);
    const { pendingInput } = JSON.parse(readFileSync(join(project, ".outside-in/session.json"), "utf8"));
    expect(pendingInput.actions.map((action: { key: string }) => action.key)).toEqual(["view", "continue", "abort"]);
  });

  it("selects the features, says they wait for feature writing and saves them in the session", () => {
    const project = committedRunProject();
    const printed: string[] = [];
    beginRun(project, parseRunArgs(["--fr", "FR-A-02"]), environment(printed));
    expect(printed.at(-1)).toContain("start finished; selected FR-A-02 wait for feature writing");
    const saved = JSON.parse(readFileSync(join(project, ".outside-in/session.json"), "utf8"));
    expect(saved).toMatchObject({ state: "FEATURE_WRITE", targetFrs: ["FR-A-02"] });
  });

  it("refuses a project without a configuration file before it creates anything", () => {
    const project = committedRunProject();
    gitIn(project, "rm", "--quiet", ".outside-in.json");
    expect(() => beginRun(project, parseRunArgs([]), environment([]))).toThrow(".outside-in.json is missing");
    expect(gitIn(project, "worktree", "list").split("\n")).toHaveLength(1);
    expect(existsSync(join(project, ".outside-in"))).toBe(false);
  });

  it("reports a target it cannot accept as an error of the run, logs it and ends with exit code 1", () => {
    const project = committedRunProject();
    const printed: string[] = [];
    let exitCode: number | undefined;
    expect(() => (exitCode = beginRun(project, parseRunArgs(["--fr", "FR-A-09"]), environment(printed)))).not.toThrow();
    expect(exitCode).toBe(1);
    expect(printed.at(-1)).toBe("error: FR-A-09 is not in SPEC.md\n");
    const log = readFileSync(join(project, ".outside-in/runs/2026-10-02T21-30-00Z-a1b2/events.jsonl"), "utf8");
    expect(log).toContain('"type":"error","message":"FR-A-09 is not in SPEC.md"');
    expect(existsSync(join(project, ".outside-in/lock"))).toBe(false);
  });

  it("has nothing to do when no feature is pending, and selects none", () => {
    const project = committedRunProject({ unit: "passed", bdd: "PASSED" }, "done");
    const printed: string[] = [];
    expect(beginRun(project, parseRunArgs([]), environment(printed))).toBe(0);
    expect(printed.at(-1)).toBe("[SELECT_FR -> DONE] no pending features\n");
    const saved = JSON.parse(readFileSync(join(project, ".outside-in/session.json"), "utf8"));
    expect(saved.targetFrs).toBeUndefined();
  });
});
