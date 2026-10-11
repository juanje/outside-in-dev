import { spawn, spawnSync } from "node:child_process";
import type { Readable } from "node:stream";

/** The limits of a supervised command: how long it may run, and how long the processes it started have to end after SIGTERM before they get SIGKILL. */
export type CommandLimit = { timeoutMs: number; graceMs: number };

/** What a supervised command did: its exit code (null when a signal ended it), what it printed, and whether it was stopped at the limit. */
export type SupervisedRun = { status: number | null; stdout: string; stderr: string; timedOut: boolean };

/** The file descriptor the supervisor writes to when it stops the command at the limit. */
const TIMEOUT_CHANNEL = 3;
const PIPE = "pipe";
/** The standard streams of a supervisor: nothing in, and the output, the errors and the timeout channel read by the caller. */
const SUPERVISOR_STDIO: ["ignore", "pipe", "pipe", "pipe"] = ["ignore", PIPE, PIPE, PIPE];
const STOP_SIGNAL = "SIGTERM";
const ABORT_EVENT = "abort";
/** The event of a process that has ended and whose output has been read to the end. */
const ENDED_EVENT = "close";

/** The program of the supervisor, run with `node -e`: starts `sh -c <command>` as the leader of its own process group with the output passed straight through, stops the whole group (SIGTERM, then SIGKILL after the grace) at the limit or when the supervisor itself gets a signal, and waits until no process of the group is left. */
const SUPERVISOR = `
const { spawn } = require("node:child_process");
const { writeSync } = require("node:fs");
const [timeoutMs, graceMs, commandLine] = process.argv.slice(1);
const child = spawn("sh", ["-c", commandLine], { detached: true, stdio: ["ignore", 1, 2] });
const group = child.pid;
const signalGroup = (signal) => { try { process.kill(-group, signal); return true; } catch { return false; } };
let stopping = false;
const stop = (onGone) => {
  if (stopping) return;
  stopping = true;
  const killer = setTimeout(() => signalGroup("SIGKILL"), Number(graceMs));
  signalGroup("SIGTERM");
  const poll = setInterval(() => { if (!signalGroup(0)) { clearInterval(poll); clearTimeout(killer); onGone(); } }, 10);
};
const timer = setTimeout(() => { writeSync(${TIMEOUT_CHANNEL}, "timeout"); stop(() => process.exit(0)); }, Number(timeoutMs));
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => stop(() => process.exit(128)));
child.on("close", (code, signal) => {
  if (stopping) return;
  clearTimeout(timer);
  if (signal === null) process.exit(code);
  for (const name of ["SIGINT", "SIGTERM", "SIGHUP"]) process.removeAllListeners(name);
  process.kill(process.pid, signal);
});
`;

/** The arguments for `node` that run the supervisor on `commandLine` with `limit`. */
export function supervisorArguments(commandLine: string, { timeoutMs, graceMs }: CommandLimit): string[] {
  return ["-e", SUPERVISOR, String(timeoutMs), String(graceMs), commandLine];
}

/** Runs a command line through the shell in `cwd` as the leader of its own process group, and stops the whole group when it passes the limit; returns when no process of the command is left. */
export function runSupervised(cwd: string, commandLine: string, limit: CommandLimit): SupervisedRun {
  const { status, stdout, stderr, output } = spawnSync(process.execPath, supervisorArguments(commandLine, limit), { cwd, stdio: SUPERVISOR_STDIO, maxBuffer: Infinity });
  return { status, stdout: stdout.toString(), stderr: stderr.toString(), timedOut: (output[TIMEOUT_CHANNEL]?.length ?? 0) > 0 };
}

/** What a command run without blocking did: as `SupervisedRun`, and whether the signal ended the wait. */
export type AbortableRun = SupervisedRun & { aborted: boolean };

/** Calls `onData` with each chunk a stream gives. */
function collect(stream: Readable, onData: (chunk: Buffer) => void): void {
  stream.on("data", onData);
}

/** Runs a command line as `runSupervised` does, in the same supervisor and process group, but without blocking the event loop of this process, so that timers, signals and other work go on. When `signal` aborts, the supervisor is told to stop the whole group and the promise resolves at once with `aborted`; the group is gone a moment later, on its own. A signal that is already aborted starts nothing. */
export function runSupervisedAsync(cwd: string, commandLine: string, limit: CommandLimit, signal?: AbortSignal): Promise<AbortableRun> {
  if (signal?.aborted) return Promise.resolve({ status: null, stdout: "", stderr: "", timedOut: false, aborted: true });
  return new Promise((resolve) => {
    const supervisor = spawn(process.execPath, supervisorArguments(commandLine, limit), { cwd, stdio: SUPERVISOR_STDIO });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let timedOut = false;
    collect(supervisor.stdout!, (chunk) => out.push(chunk));
    collect(supervisor.stderr!, (chunk) => err.push(chunk));
    collect(supervisor.stdio[TIMEOUT_CHANNEL] as Readable, () => (timedOut = true));
    let settled = false;
    const settle = (status: number | null, aborted: boolean): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener(ABORT_EVENT, onAbort);
      resolve({ status, stdout: Buffer.concat(out).toString(), stderr: Buffer.concat(err).toString(), timedOut, aborted });
    };
    const onAbort = (): void => {
      supervisor.kill(STOP_SIGNAL);
      settle(null, true);
    };
    signal?.addEventListener(ABORT_EVENT, onAbort, { once: true });
    supervisor.once(ENDED_EVENT, (status) => settle(status, false));
  });
}
