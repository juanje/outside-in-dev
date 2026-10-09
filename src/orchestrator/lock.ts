import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "../artifacts/atomic-write.js";
import { processExists } from "../artifacts/process-exists.js";
import { ProgressError } from "../artifacts/progress.js";
import { readText } from "../artifacts/project-json.js";
import { OUTSIDE_IN_DIR } from "./session.js";

/** The lock file of the project, relative to it. */
export const LOCK_FILE = `${OUTSIDE_IN_DIR}/lock`;

/** The process that holds the lock of the project; undefined when no lock is held. */
export function lockHolder(cwd: string): number | undefined {
  const held = readText(cwd, LOCK_FILE);
  return held === undefined ? undefined : Number(held);
}

/** The refusal of a lock that a running process holds. */
function heldBy(holder: number): ProgressError {
  return new ProgressError(`another run holds the lock ${LOCK_FILE} (process ${holder})`);
}

function writeLock(cwd: string, pid: number): void {
  mkdirSync(join(cwd, OUTSIDE_IN_DIR), { recursive: true });
  writeFileAtomic(join(cwd, LOCK_FILE), `${pid}\n`);
}

/** Takes the lock of the project for the process `pid`; throws when a lock is already held. */
export function acquireLock(cwd: string, pid: number, isRunning: (pid: number) => boolean = processExists): void {
  const holder = lockHolder(cwd);
  if (holder !== undefined) {
    if (isRunning(holder)) throw heldBy(holder);
    throw new ProgressError(`the lock ${LOCK_FILE} was left by a run: process ${holder} is not running; if no run is in progress, remove ${LOCK_FILE}`);
  }
  writeLock(cwd, pid);
}

/** Takes the lock of the project for the process `pid` to resume a run: a lock whose process is gone is released first, and that process is returned; throws when a running process holds it. */
export function takeOverLock(cwd: string, pid: number, isRunning: (pid: number) => boolean = processExists): number | undefined {
  const holder = lockHolder(cwd);
  if (holder !== undefined && isRunning(holder)) throw heldBy(holder);
  writeLock(cwd, pid);
  return holder;
}
/** Releases the lock of the project. */
export function releaseLock(cwd: string): void {
  rmSync(join(cwd, LOCK_FILE), { force: true });
}
