import { randomBytes } from "node:crypto";
import type { CliIo } from "../cli-io.js";
import { parseRunArgs } from "../orchestrator/run-args.js";
import { runFeatureCycle } from "../orchestrator/run-features.js";
import type { RunServices } from "../orchestrator/services.js";

const SUFFIX_BYTES = 2;
const HEX_RADIX = 16;

/** `oid run`: runs the project of `io` up to the review of its feature files and returns the exit code of the process. */
export function runRun(io: CliIo, args: string[], services: RunServices): Promise<number> {
  const environment = { now: new Date(), suffix: randomBytes(SUFFIX_BYTES).readUInt16BE().toString(HEX_RADIX), write: io.stdout };
  return runFeatureCycle(io.cwd, parseRunArgs(args), environment, services);
}
