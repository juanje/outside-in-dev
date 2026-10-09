import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProgressError } from "../../src/artifacts/progress.js";
import { takeOverLock } from "../../src/orchestrator/lock.js";

describe("taking over the lock of a run that died", () => {
  let cwd = "";
  const held = (pid: number) => {
    mkdirSync(join(cwd, ".outside-in"), { recursive: true });
    writeFileSync(join(cwd, ".outside-in/lock"), `${pid}\n`);
  };
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "oid-lock-"));
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it("releases a lock whose process is gone, takes it and returns the process that held it", () => {
    held(4242);
    expect(takeOverLock(cwd, 7, () => false)).toBe(4242);
    expect(readFileSync(join(cwd, ".outside-in/lock"), "utf8")).toBe("7\n");
  });

  it("takes a lock that nobody holds and releases nothing", () => {
    expect(takeOverLock(cwd, 7, () => false)).toBeUndefined();
    expect(readFileSync(join(cwd, ".outside-in/lock"), "utf8")).toBe("7\n");
  });

  it("refuses a lock whose process is running, and leaves it as it is", () => {
    held(4242);
    expect(() => takeOverLock(cwd, 7, () => true)).toThrow(new ProgressError("another run holds the lock .outside-in/lock (process 4242)"));
    expect(readFileSync(join(cwd, ".outside-in/lock"), "utf8")).toBe("4242\n");
  });
});
