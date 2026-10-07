import { randomBytes } from "node:crypto";
import type { CliIo } from "../cli-io.js";
import { beginRun } from "../orchestrator/begin.js";
import { parseRunArgs } from "../orchestrator/run-args.js";

const SUFFIX_BYTES = 2;
const HEX_RADIX = 16;

/** `oid run`: starts a run in the project of `io` and returns the exit code of the process. */
export function runRun(io: CliIo, args: string[]): number {
  const environment = { pid: process.pid, now: new Date(), suffix: randomBytes(SUFFIX_BYTES).readUInt16BE().toString(HEX_RADIX), write: io.stdout };
  return beginRun(io.cwd, parseRunArgs(args), environment);
}
