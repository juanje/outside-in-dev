import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { commitAll, git } from "./git-fixture.js";
import { runInProject } from "./run-capture.js";
import { dir, REAL_PROCESS_TIMEOUT_MS, useTempDir, write, writeMinimalConfig } from "./temp-project.js";

useTempDir();

describe("oid clean", () => {
  it("removes the worktree of a finished run without removing its branch", async () => {
    writeMinimalConfig();
    write("README.md", "fixture\n");
    commitAll();

    const runId = "finished-run";
    const worktree = join(dirname(dir), ".oid-worktrees", basename(dir), runId);
    git("worktree", "add", "--quiet", "-b", `oid/${runId}`, worktree, "HEAD");
    const runData = join(dir, ".outside-in", "runs", runId);
    mkdirSync(runData, { recursive: true });
    writeFileSync(join(runData, "events.jsonl"), `${JSON.stringify({ ts: 1, type: "state_change", to: "FR_COMMIT" })}\n`);

    expect(existsSync(worktree)).toBe(true);
    const result = await runInProject(["clean"]);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(existsSync(worktree)).toBe(false);
    expect(git("show-ref", "--verify", `refs/heads/oid/${runId}`)).not.toBe("");
  }, REAL_PROCESS_TIMEOUT_MS);

  it("removes a finished run that stopped before feature selection", async () => {
    writeMinimalConfig();
    write("README.md", "fixture\n");
    commitAll();

    const runId = "unselected-run";
    const worktree = join(dirname(dir), ".oid-worktrees", basename(dir), runId);
    git("worktree", "add", "--quiet", "-b", `oid/${runId}`, worktree, "HEAD");
    const runData = join(dir, ".outside-in", "runs", runId);
    mkdirSync(runData, { recursive: true });
    writeFileSync(join(runData, "events.jsonl"), `${JSON.stringify({ ts: 1, type: "state_change", to: "SELECT_FR" })}\n`);

    expect(existsSync(worktree)).toBe(true);
    const result = await runInProject(["clean"]);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(existsSync(worktree)).toBe(false);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("removes a finished run replaced by a later saved session", async () => {
    writeMinimalConfig();
    write("README.md", "fixture\n");
    commitAll();

    const runId = "replaced-run";
    const worktree = join(dirname(dir), ".oid-worktrees", basename(dir), runId);
    git("worktree", "add", "--quiet", "-b", `oid/${runId}`, worktree, "HEAD");
    const runData = join(dir, ".outside-in", "runs", runId);
    mkdirSync(runData, { recursive: true });
    writeFileSync(join(runData, "events.jsonl"), `${JSON.stringify({ ts: 1, type: "state_change", to: "BDD_RED" })}\n`);
    write(".outside-in/session.json", JSON.stringify({ runId: "later-run", state: "BDD_RED" }));

    expect(existsSync(worktree)).toBe(true);
    expect(existsSync(runData)).toBe(true);
    const result = await runInProject(["clean"]);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(existsSync(worktree)).toBe(false);
    expect(existsSync(runData)).toBe(false);
    expect(git("show-ref", "--verify", `refs/heads/oid/${runId}`)).not.toBe("");
  }, REAL_PROCESS_TIMEOUT_MS);

  it("removes the saved session when cleaning a named resumable run", async () => {
    writeMinimalConfig();
    write("README.md", "fixture\n");
    commitAll();

    const runId = "resumable-run";
    const worktree = join(dirname(dir), ".oid-worktrees", basename(dir), runId);
    git("worktree", "add", "--quiet", "-b", `oid/${runId}`, worktree, "HEAD");
    const runData = join(dir, ".outside-in", "runs", runId);
    mkdirSync(runData, { recursive: true });
    writeFileSync(join(runData, "baseline.json"), "{}\n");
    writeFileSync(join(runData, "events.jsonl"), `${JSON.stringify({ ts: 1, type: "state_change", to: "BDD_RED" })}\n`);
    write(".outside-in/session.json", JSON.stringify({ runId, state: "BDD_RED" }));

    expect(existsSync(join(dir, ".outside-in", "session.json"))).toBe(true);
    const result = await runInProject(["clean", "--run", runId]);

    expect(result.exitCode, result.stderr).toBe(0);
    expect(existsSync(join(dir, ".outside-in", "session.json"))).toBe(false);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("keeps a named run in progress", async () => {
    writeMinimalConfig();
    write("README.md", "fixture\n");
    commitAll();

    const runId = "active-run";
    const worktree = join(dirname(dir), ".oid-worktrees", basename(dir), runId);
    git("worktree", "add", "--quiet", "-b", `oid/${runId}`, worktree, "HEAD");
    const runData = join(dir, ".outside-in", "runs", runId);
    mkdirSync(runData, { recursive: true });
    writeFileSync(join(runData, "baseline.json"), "{}\n");
    writeFileSync(join(runData, "events.jsonl"), `${JSON.stringify({ ts: 1, type: "state_change", to: "BDD_RED" })}\n`);
    write(".outside-in/session.json", JSON.stringify({ runId, state: "BDD_RED" }));
    const holder = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    try {
      expect(holder.pid).toBeDefined();
      write(".outside-in/lock", `${holder.pid}\n`);
      expect(existsSync(worktree)).toBe(true);
      expect(existsSync(runData)).toBe(true);

      const result = await runInProject(["clean", "--run", runId]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(existsSync(worktree)).toBe(true);
      expect(existsSync(runData)).toBe(true);
      expect(git("show-ref", "--verify", `refs/heads/oid/${runId}`)).not.toBe("");
    } finally {
      holder.kill();
    }
  }, REAL_PROCESS_TIMEOUT_MS);

  it("reports a failed worktree removal and keeps the run data and branch", async () => {
    writeMinimalConfig();
    write("README.md", "fixture\n");
    commitAll();

    const runId = "failed-clean";
    const worktree = join(dirname(dir), ".oid-worktrees", basename(dir), runId);
    git("worktree", "add", "--quiet", "-b", `oid/${runId}`, worktree, "HEAD");
    git("worktree", "lock", "--reason", "the removal is expected to fail", worktree);
    const runData = join(dir, ".outside-in", "runs", runId);
    mkdirSync(runData, { recursive: true });
    writeFileSync(join(runData, "events.jsonl"), `${JSON.stringify({ ts: 1, type: "state_change", to: "FR_COMMIT" })}\n`);

    const result = await runInProject(["clean", "--run", runId]).catch((error: unknown) => ({ stderr: String(error) }));

    expect(result.stderr).toMatch(new RegExp(`worktree of ${runId} could not be removed`, "i"));
    expect(existsSync(runData)).toBe(true);
    expect(git("show-ref", "--verify", `refs/heads/oid/${runId}`)).not.toBe("");
  }, REAL_PROCESS_TIMEOUT_MS);
});
