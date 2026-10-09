#!/usr/bin/env node
import type { RunServices } from "./orchestrator/services.js";
import { runCli } from "./run-cli.js";

// The reader closed stdout early (for example `oid progress status | head -1`): stop writing quietly
// and keep the exit code the command computed.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code !== "EPIPE") throw error;
});

/** What `oid run` and `oid resume` take from this process: its id, oid's agent directory, the terminal that reviews and whether `oid abort` signalled it (SIGTERM: the run stops after the step it is in). Loaded only for these commands, so that no other command loads the agent SDK. */
async function runServices(): Promise<RunServices> {
  const [{ oidAgentDir }, { terminalInput }] = await Promise.all([import("./agents/runner.js"), import("./commands/terminal-input.js")]);
  const input = process.stdin.isTTY && process.stdout.isTTY ? terminalInput(process.stdin, process.stdout) : { isTTY: false as const };
  let abortRequested = false;
  process.on("SIGTERM", () => {
    abortRequested = true;
  });
  return { pid: process.pid, agentDir: oidAgentDir(process.env), input, aborted: () => abortRequested };
}

/** What each command takes from this process; the others take nothing. */
const SERVICES: Record<string, () => Promise<Parameters<typeof runCli>[2]>> = {
  run: runServices,
  resume: runServices,
  verify: async () => ({ pid: process.pid }),
  abort: async () => ({ signal: (pid: number) => process.kill(pid, "SIGTERM") }),
};

const args = process.argv.slice(2);

process.exitCode = await runCli(
  args,
  {
    cwd: process.cwd(),
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  },
  await SERVICES[args[0] ?? ""]?.(),
);
