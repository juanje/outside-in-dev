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
  const [{ oidAgentDir }, { oidConfigDir }, { terminalInput }] = await Promise.all([import("./agents/runner.js"), import("./artifacts/user-config.js"), import("./commands/terminal-input.js")]);
  const input = process.stdin.isTTY && process.stdout.isTTY ? terminalInput(process.stdin, process.stdout) : { isTTY: false as const };
  let abortRequested = false;
  process.on("SIGTERM", () => {
    abortRequested = true;
  });
  const where = { agentDir: oidAgentDir(process.env), configDir: oidConfigDir(process.env) };
  return { pid: process.pid, ...where, input, aborted: () => abortRequested, preflight: where };
}

/** What `oid doctor` takes from this process: where the user's configuration and oid's agent directory are. */
async function doctorServices() {
  const { oidAgentDir, oidConfigDir } = await import("./artifacts/user-config.js");
  return { agentDir: oidAgentDir(process.env), configDir: oidConfigDir(process.env) };
}

/** What `oid setup` and `oid init` (which offers it) take from this process: where the user's configuration is, the terminal, and the standard input. */
async function setupFromProcess() {
  return (await import("./commands/setup-services.js")).setupServices(process.env, process.stdin, process.stdout);
}

/** What each command takes from this process; the others take nothing. */
const SERVICES: Record<string, () => Promise<Parameters<typeof runCli>[2]>> = {
  setup: setupFromProcess,
  init: setupFromProcess,
  doctor: doctorServices,
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
