import { ProgressError } from "./artifacts/progress.js";
import type { CliIo } from "./cli-io.js";
import { runProgress } from "./commands/progress.js";

export function runCli(args: string[], io: CliIo): number {
  try {
    runProgress(args.slice(1), io);
    return 0;
  } catch (error) {
    if (error instanceof ProgressError) {
      io.stderr(`error: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}
