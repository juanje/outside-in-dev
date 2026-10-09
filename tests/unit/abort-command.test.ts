import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAbort } from "../../src/commands/abort.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

/** Runs `oid abort` in the temporary project with a signal that is recorded, and a holder that runs when `running` says so. */
function abort(running: boolean) {
  const signalled: number[] = [];
  let stdout = "";
  let stderr = "";
  const io = { cwd: dir, stdout: (text: string) => (stdout += text), stderr: (text: string) => (stderr += text) };
  const exitCode = runAbort(io, { signal: (pid) => signalled.push(pid) }, () => running);
  return { exitCode, stdout, stderr, signalled };
}

function lockHeldBy(pid: number): void {
  mkdirSync(join(dir, ".outside-in"), { recursive: true });
  writeFileSync(join(dir, ".outside-in/lock"), `${pid}\n`);
}

describe("oid abort", () => {
  it("signals the process that holds the lock and says so", () => {
    lockHeldBy(4242);
    const { exitCode, stdout, signalled } = abort(true);
    expect([exitCode, signalled]).toEqual([0, [4242]]);
    expect(stdout).toContain("4242");
  });

  it("signals nothing when no run holds the lock", () => {
    const { exitCode, stderr, signalled } = abort(true);
    expect([exitCode, signalled]).toEqual([1, []]);
    expect(stderr).toContain("no run is in progress");
  });

  it("signals nothing when the process of the lock is gone, says that oid resume releases it, and leaves the lock", () => {
    lockHeldBy(4242);
    const { exitCode, stderr, signalled } = abort(false);
    expect([exitCode, signalled]).toEqual([1, []]);
    for (const text of [".outside-in/lock", "4242", "oid resume"]) expect(stderr).toContain(text);
    expect(readFileSync(join(dir, ".outside-in/lock"), "utf8")).toBe("4242\n");
  });
});
