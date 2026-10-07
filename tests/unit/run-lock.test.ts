import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProgressError } from "../../src/artifacts/progress.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acquireLock, releaseLock } from "../../src/orchestrator/lock.js";

describe("run lock", () => {
  let cwd = "";
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "oid-lock-"));
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it("holds the process id of the run in the lock file", () => {
    acquireLock(cwd, 4242);
    expect(readFileSync(join(cwd, ".outside-in/lock"), "utf8")).toBe("4242\n");
  });

  it("refuses to take a lock held by a process that is running, naming the file and the process", () => {
    acquireLock(cwd, 4242);
    expect(() => acquireLock(cwd, 7, () => true)).toThrow(new ProgressError("another run holds the lock .outside-in/lock (process 4242)"));
  });

  it("refuses to take a lock whose process is gone, and says how to remove it", () => {
    acquireLock(cwd, 4242);
    const refused = () => acquireLock(cwd, 7, () => false);
    expect(refused).toThrow("process 4242 is not running");
    expect(refused).toThrow("remove .outside-in/lock");
    expect(readFileSync(join(cwd, ".outside-in/lock"), "utf8")).toBe("4242\n");
  });

  it("is released by removing the lock file", () => {
    acquireLock(cwd, 4242);
    releaseLock(cwd);
    expect(existsSync(join(cwd, ".outside-in/lock"))).toBe(false);
  });
});
