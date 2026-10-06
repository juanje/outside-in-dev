import { ProgressError } from "./artifacts/progress.js";
import { commandError } from "./cli-usage.js";
import type { CliIo } from "./cli-io.js";
import { runCheck } from "./commands/check.js";
import { runInit } from "./commands/init.js";
import { runProgress } from "./commands/progress.js";

const COMMANDS = ["progress", "check", "init"];

export function runCli(args: string[], io: CliIo): number {
  try {
    const [command, ...rest] = args;
    if (!COMMANDS.includes(command!)) {
      throw commandError("command", command, COMMANDS);
    }
    if (command === "check") return runCheck(io, rest.includes("--json"));
    if (command === "init") return runInit(io, rest.includes("--import-progress"), rest.find((arg) => !arg.startsWith("--")));
    runProgress(rest, io);
    return 0;
  } catch (error) {
    if (error instanceof ProgressError) {
      io.stderr(`error: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}
