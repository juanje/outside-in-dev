import type { CliIo } from "../cli-io.js";
import { processExists } from "../artifacts/process-exists.js";
import { LOCK_FILE, lockHolder } from "../orchestrator/lock.js";

/** What `oid abort` takes from the process that runs it: how to signal the process of a run. */
export type AbortServices = { signal(pid: number): void };

/** `oid abort`: signals the process that holds the lock of the project, which stops its run after the step it is in. Returns the exit code of the process. */
export function runAbort(io: CliIo, services: AbortServices, isRunning: (pid: number) => boolean = processExists): number {
  const holder = lockHolder(io.cwd);
  if (holder === undefined) {
    io.stderr(`error: no run is in progress: no process holds the lock ${LOCK_FILE}\n`);
    return 1;
  }
  if (!isRunning(holder)) {
    io.stderr(`error: the lock ${LOCK_FILE} was left by a run: process ${holder} is not running; oid resume releases it and resumes the run\n`);
    return 1;
  }
  services.signal(holder);
  io.stdout(`signalled process ${holder}: its run stops after the step it is in\n`);
  return 0;
}
