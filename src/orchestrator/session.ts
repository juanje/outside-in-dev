import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "../artifacts/atomic-write.js";
import { readJson } from "../artifacts/project-json.js";
import type { InputRequest } from "../events/types.js";

/** The directory of oid's local state, relative to the project. */
export const OUTSIDE_IN_DIR = ".outside-in";
const SESSION_FILE = `${OUTSIDE_IN_DIR}/session.json`;

/** Saves the session of the run with the request that waits for an answer, keeping what an earlier session held. */
export function savePendingInput(cwd: string, runId: string, request: InputRequest): void {
  const saved = (readJson(cwd, SESSION_FILE) ?? {}) as object;
  mkdirSync(join(cwd, OUTSIDE_IN_DIR), { recursive: true });
  writeFileAtomic(join(cwd, SESSION_FILE), `${JSON.stringify({ ...saved, runId, pendingInput: request })}\n`);
}
