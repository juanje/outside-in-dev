import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "../artifacts/atomic-write.js";
import { readJson } from "../artifacts/project-json.js";
import type { InputRequest } from "../events/types.js";

/** The directory of oid's local state, relative to the project. */
export const OUTSIDE_IN_DIR = ".outside-in";
const SESSION_FILE = `${OUTSIDE_IN_DIR}/session.json`;

/** The directory of a run's logs and records. */
export function runDirectory(cwd: string, runId: string): string {
  return join(cwd, OUTSIDE_IN_DIR, "runs", runId);
}

/** What a started run saves to be resumed: where it works and the state it reached. */
export type RunSession = { runId: string; worktree: string; branch: string; baseCommit: string; state: string; targetFrs?: string[] };

function writeSession(cwd: string, session: object): void {
  mkdirSync(join(cwd, OUTSIDE_IN_DIR), { recursive: true });
  writeFileAtomic(join(cwd, SESSION_FILE), `${JSON.stringify(session)}\n`);
}

/** Saves the session of a new run, replacing whatever an earlier run saved. */
export function startSession(cwd: string, session: RunSession): void {
  writeSession(cwd, session);
}

/** Changes some fields of the saved session of the run, keeping the rest. */
export function updateSession(cwd: string, changes: Partial<RunSession>): void {
  writeSession(cwd, { ...(readJson(cwd, SESSION_FILE) as object), ...changes });
}

/** Saves the session of the run with the request that waits for an answer, keeping what an earlier session held. */
export function savePendingInput(cwd: string, runId: string, request: InputRequest): void {
  const saved = (readJson(cwd, SESSION_FILE) ?? {}) as object;
  writeSession(cwd, { ...saved, runId, pendingInput: request });
}
