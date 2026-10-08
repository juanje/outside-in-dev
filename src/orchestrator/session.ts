import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "../artifacts/atomic-write.js";
import { isObject, ProgressError } from "../artifacts/progress.js";
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
export type RunSession = { runId: string; worktree: string; branch: string; baseCommit: string; state: string; targetFrs?: string[]; featureHashes?: Record<string, string>; fr?: string; scenario?: { index: number; name: string; location: string }; scenarioUnitTests?: Record<string, string[]>; innerIteration?: number };

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

/** Saves the session of the run with the request that waits for an answer, keeping what an earlier session of the same run held. */
export function savePendingInput(cwd: string, runId: string, request: InputRequest): void {
  const saved = readJson(cwd, SESSION_FILE);
  if (saved !== undefined && !isObject(saved)) throw new ProgressError(`${SESSION_FILE} is not an object`);
  const sameRun = saved !== undefined && "runId" in saved && saved.runId === runId;
  writeSession(cwd, { ...(sameRun ? saved : {}), runId, pendingInput: request });
}

/** The unit tests the saved session records for a scenario, in the order they were written. */
export function unitTestsOf(cwd: string, scenario: string): string[] {
  const saved = readJson(cwd, SESSION_FILE) as RunSession;
  return saved.scenarioUnitTests?.[scenario] ?? [];
}

/** Records a unit test of a scenario in the saved session. */
export function recordUnitTest(cwd: string, scenario: string, test: string): void {
  const saved = readJson(cwd, SESSION_FILE) as RunSession;
  updateSession(cwd, { scenarioUnitTests: { ...saved.scenarioUnitTests, [scenario]: [...unitTestsOf(cwd, scenario), test] } });
}
