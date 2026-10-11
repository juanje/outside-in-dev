/** The part of the process that the guard uses. */
export type ExitingProcess = { once(event: "exit", listener: () => void): unknown; stderr: { write(text: string): unknown } };

/** Watches a command from `oid`'s entry point: when the process ends before `settled` was called (Node ends a program whose top-level await can never settle with exit code 13 and no word from oid), says which command it was and how to go on. */
export function watchUnsettled(process: ExitingProcess, command: string): { settled(): void } {
  let finished = false;
  process.once("exit", () => {
    if (finished) return;
    process.stderr.write(`oid: the process ended while "oid ${command}" had not finished (nothing was left to wait for). A run is as its last checkpoint left it, and "oid resume" continues it (it releases the lock of a process that is gone).\n`);
  });
  return {
    settled: () => {
      finished = true;
    },
  };
}
