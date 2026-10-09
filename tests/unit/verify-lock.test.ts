import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProgressError } from "../../src/artifacts/progress.js";
import { runCli } from "../../src/run-cli.js";
import { withVerifyLock } from "../../src/artifacts/verify-lock.js";
import { dir, REAL_PROCESS_TIMEOUT_MS, useTempDir, write, writeMinimalConfig } from "./temp-project.js";

useTempDir();

const LOCK = ".outside-in/verify.lock";
const lockPath = (): string => join(dir, LOCK);

describe("withVerifyLock", () => {
  it("holds the process id in the lock file while the work runs, and removes the file after it", () => {
    let held = "";
    withVerifyLock(dir, { pid: 4242 }, () => {
      held = readFileSync(lockPath(), "utf8");
    });
    expect([held, existsSync(lockPath())]).toEqual(["4242\n", false]);
  });

  it("removes the lock file when the work throws", () => {
    expect(() =>
      withVerifyLock(dir, { pid: 4242 }, () => {
        throw new Error("the runner broke");
      }),
    ).toThrow("the runner broke");
    expect(existsSync(lockPath())).toBe(false);
  });

  it("refuses to run while a process that is running holds the lock, naming the process and the file, and leaves the lock as it was", () => {
    write(LOCK, "4242\n");
    let ran = false;
    const refused = () => withVerifyLock(dir, { pid: 7, isRunning: (pid) => pid === 4242 }, () => (ran = true));
    expect(refused).toThrow(ProgressError);
    expect(refused).toThrow("process 4242");
    expect(refused).toThrow(LOCK);
    expect([ran, readFileSync(lockPath(), "utf8")]).toEqual([false, "4242\n"]);
  });

  it("removes a lock whose process is gone and goes on, taking the lock for itself", () => {
    write(LOCK, "4242\n");
    let held = "";
    withVerifyLock(dir, { pid: 7, isRunning: () => false }, () => {
      held = readFileSync(lockPath(), "utf8");
    });
    expect([held, existsSync(lockPath())]).toEqual(["7\n", false]);
  });
});

describe("oid verify", () => {
  const SERVICES = { pid: 7, isRunning: (pid: number) => pid === 4242 };

  async function verify(args: string[], held?: string): Promise<{ exitCode: number; stderr: string }> {
    writeMinimalConfig();
    if (held !== undefined) write(LOCK, held);
    let stderr = "";
    const exitCode = await runCli(args, { cwd: dir, stdout: () => undefined, stderr: (text) => (stderr += text) }, SERVICES);
    return { exitCode, stderr };
  }

  it("refuses a red while another verify holds the lock, with exit 1 and the process and the file named", async () => {
    const { exitCode, stderr } = await verify(["verify", "red", "tests/unit/a.test.ts > adds"], "4242\n");
    expect({ exitCode, stderr }).toEqual({ exitCode: 1, stderr: `error: another oid verify holds the lock ${LOCK} (process 4242); wait for it, or kill that process if it hangs\n` });
  }, REAL_PROCESS_TIMEOUT_MS);

  it("refuses a green while another verify holds the lock", async () => {
    expect((await verify(["verify", "green"], "4242\n")).stderr).toContain(`holds the lock ${LOCK} (process 4242)`);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("removes the lock when the verify ends, also when it fails", async () => {
    await verify(["verify", "red", "tests/unit/a.test.ts > adds"]);
    expect(existsSync(lockPath())).toBe(false);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("does not take the lock for the integrity check, which only reads", async () => {
    expect((await verify(["verify", "integrity"], "4242\n")).stderr).not.toContain("verify.lock");
  }, REAL_PROCESS_TIMEOUT_MS);
});
