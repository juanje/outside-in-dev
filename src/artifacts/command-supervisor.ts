import { spawnSync } from "node:child_process";

/** The limits of a supervised command: how long it may run, and how long the processes it started have to end after SIGTERM before they get SIGKILL. */
export type CommandLimit = { timeoutMs: number; graceMs: number };

/** What a supervised command did: its exit code (null when a signal ended it), what it printed, and whether it was stopped at the limit. */
export type SupervisedRun = { status: number | null; stdout: string; stderr: string; timedOut: boolean };

/** The file descriptor the supervisor writes to when it stops the command at the limit. */
const TIMEOUT_CHANNEL = 3;
const PIPE = "pipe";

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
  const { status, stdout, stderr, output } = spawnSync(process.execPath, supervisorArguments(commandLine, limit), { cwd, stdio: ["ignore", PIPE, PIPE, PIPE], maxBuffer: Infinity });
  return { status, stdout: stdout.toString(), stderr: stderr.toString(), timedOut: (output[TIMEOUT_CHANNEL]?.length ?? 0) > 0 };
}
