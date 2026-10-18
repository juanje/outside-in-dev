import { existsSync, readdirSync, rmSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { CliIo } from "../cli-io.js";
import { OID_DIR } from "../artifacts/checkpoint.js";
import { ProgressError } from "../artifacts/progress.js";
import { processExists } from "../artifacts/process-exists.js";
import { removeWorktree } from "../artifacts/git-workspace.js";
import { loadGitSettings, loadProjectConfig } from "../artifacts/project-config.js";
import { heldBy, lockHolder } from "../orchestrator/lock.js";
import { whyNotResumable } from "../orchestrator/resume.js";
import { clearSession, readSession, runDirectory } from "../orchestrator/session.js";

/** A run is finished when `oid resume` cannot continue it: the saved session does not name it (it was replaced, or none is saved) or `oid resume` refuses it. */
function finished(session: ReturnType<typeof readSession>, runId: string): boolean {
  return session?.runId !== runId || whyNotResumable(session) !== undefined;
}

function runsToClean(cwd: string, runId: string | undefined): string[] {
  const runsRoot = resolve(cwd, OID_DIR, "runs");
  return runId === undefined ? (existsSync(runsRoot) ? readdirSync(runsRoot) : []) : [runId];
}

function cleanRun(io: CliIo, root: string, session: ReturnType<typeof readSession>, runId: string, requestedRunId: string | undefined): boolean {
  const data = runDirectory(io.cwd, runId);
  if (!existsSync(data)) return true;

  if (requestedRunId === undefined && !finished(session, runId)) {
    io.stdout(`run ${runId} can be resumed; use oid clean --run ${runId}\n`);
    return true;
  }

  const path = resolve(root, runId);
  try {
    removeWorktree(io.cwd, { path, branch: "", startCommit: "" });
  } catch (error) {
    io.stderr(`worktree of ${runId} could not be removed: ${String(error)}\n`);
    return false;
  }
  rmSync(data, { recursive: true, force: true });
  if (session?.runId === runId) clearSession(io.cwd);
  return true;
}

/** Removes the worktrees and data of finished runs, leaving their branches intact. */
export function runClean(io: CliIo, runId?: string): number {
  loadProjectConfig(io.cwd);
  if (runId !== undefined && !existsSync(runDirectory(io.cwd, runId))) throw new ProgressError(`run ${runId} does not exist`);
  const runs = runsToClean(io.cwd, runId);
  const settings = loadGitSettings(io.cwd);
  const root = resolve(io.cwd, settings.worktree_dir, basename(io.cwd));
  const session = readSession(io.cwd);
  const holder = lockHolder(io.cwd);
  if (holder !== undefined && processExists(holder)) throw heldBy(holder);

  const results = runs.map((run) => cleanRun(io, root, session, run, runId));
  return results.every(Boolean) ? 0 : 1;
}
