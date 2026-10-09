import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "./atomic-write.js";
import { processExists } from "./process-exists.js";
import { ProgressError } from "./progress.js";
import { readText } from "./project-json.js";

const LOCK_FILE = ".outside-in/verify.lock";

/** What a verification takes from the process that runs it: its id, and how to tell whether another process is running. */
export type VerifyServices = { pid: number; isRunning?: (pid: number) => boolean };

/** Runs `work` holding the verify lock of the working copy, so that one `oid verify` runs at a time; a lock whose process is gone is removed, and the lock is released when the work throws. */
export function withVerifyLock<T>(cwd: string, { pid, isRunning = processExists }: VerifyServices, work: () => T): T {
  const held = readText(cwd, LOCK_FILE);
  if (held !== undefined) {
    const holder = Number(held);
    if (isRunning(holder)) throw new ProgressError(`another oid verify holds the lock ${LOCK_FILE} (process ${holder}); wait for it, or kill that process if it hangs`);
  }
  mkdirSync(join(cwd, ".outside-in"), { recursive: true });
  writeFileAtomic(join(cwd, LOCK_FILE), `${pid}\n`);
  try {
    return work();
  } finally {
    rmSync(join(cwd, LOCK_FILE), { force: true });
  }
}
