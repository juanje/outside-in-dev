#!/usr/bin/env node
import type { RunServices } from "./orchestrator/services.js";
import { runCli } from "./run-cli.js";

// The reader closed stdout early (for example `oid progress status | head -1`): stop writing quietly
// and keep the exit code the command computed.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code !== "EPIPE") throw error;
});

/** What `oid run` takes from this process: its id, oid's agent directory and the terminal that reviews. Loaded only for `run`, so that no other command loads the agent SDK. */
async function runServices(): Promise<RunServices> {
  const [{ oidAgentDir }, { terminalInput }] = await Promise.all([import("./agents/runner.js"), import("./commands/terminal-input.js")]);
  const input = process.stdin.isTTY && process.stdout.isTTY ? terminalInput(process.stdin, process.stdout) : { isTTY: false as const };
  return { pid: process.pid, agentDir: oidAgentDir(process.env), input };
}

const args = process.argv.slice(2);

process.exitCode = await runCli(
  args,
  {
    cwd: process.cwd(),
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  },
  args[0] === "run" ? await runServices() : args[0] === "verify" ? { pid: process.pid } : undefined,
);
