import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "../artifacts/atomic-write.js";
import { ProgressError } from "../artifacts/progress.js";
import { readText } from "../artifacts/project-json.js";
import { OUTSIDE_IN_DIR } from "./session.js";

const LOCK_FILE = `${OUTSIDE_IN_DIR}/lock`;

/** Whether a process with this id exists. */
function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Takes the lock of the project for the process `pid`; throws when a lock is already held. */
export function acquireLock(cwd: string, pid: number, isRunning: (pid: number) => boolean = processExists): void {
  const held = readText(cwd, LOCK_FILE);
  if (held !== undefined) {
    const holder = Number(held);
    if (isRunning(holder)) throw new ProgressError(`another run holds the lock ${LOCK_FILE} (process ${holder})`);
    throw new ProgressError(`the lock ${LOCK_FILE} was left by a run: process ${holder} is not running; if no run is in progress, remove ${LOCK_FILE}`);
  }
  mkdirSync(join(cwd, OUTSIDE_IN_DIR), { recursive: true });
  writeFileAtomic(join(cwd, LOCK_FILE), `${pid}\n`);
}

/** Releases the lock of the project. */
export function releaseLock(cwd: string): void {
  rmSync(join(cwd, LOCK_FILE), { force: true });
}
