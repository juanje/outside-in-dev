import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../../src/run-cli.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

const SESSION = ".outside-in/session.json";

/** Runs `oid resume` in the temporary project, as a process whose id is `pid`. */
async function resume(pid = 7) {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(["resume"], { cwd: dir, stdout: (text) => (stdout += text), stderr: (text) => (stderr += text) }, { pid, agentDir: join(dir, "agent") });
  return { exitCode, stdout, stderr };
}

function saved(state: string): string {
  const text = JSON.stringify({ runId: "run-1", worktree: join(dir, "nowhere"), branch: "oid/run-1", baseCommit: "abc", state, pendingInput: { id: "old", prompt: "Old?", actions: [] } });
  write(SESSION, text);
  return text;
}

describe("oid resume refuses", () => {
  it("when no run saved a session", async () => {
    const { exitCode, stderr } = await resume();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("no run to resume");
  });

  it("a run that stopped before its features were selected, naming its state and oid run, and touches nothing", async () => {
    const text = saved("BASELINE");
    const { exitCode, stderr } = await resume();
    expect(exitCode).toBe(1);
    for (const part of ["BASELINE", "oid run"]) expect(stderr).toContain(part);
    expect(readFileSync(join(dir, SESSION), "utf8")).toBe(text);
    expect(existsSync(join(dir, ".outside-in/lock"))).toBe(false);
  });

  it("a run that is done", async () => {
    saved("DONE");
    const { exitCode, stderr } = await resume();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("nothing to resume");
  });

  it("while the process of the run holds the lock, and leaves the lock and the session as they are", async () => {
    const text = saved("FEATURE_REVIEW");
    write(".outside-in/lock", `${process.pid}\n`);
    const { exitCode, stderr } = await resume();
    expect(exitCode).toBe(1);
    expect(stderr).toContain(`another run holds the lock .outside-in/lock (process ${process.pid})`);
    expect(readFileSync(join(dir, ".outside-in/lock"), "utf8")).toBe(`${process.pid}\n`);
    expect(readFileSync(join(dir, SESSION), "utf8")).toBe(text);
  });
});
