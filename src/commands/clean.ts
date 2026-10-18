import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { CliIo } from "../cli-io.js";
import { OID_DIR } from "../artifacts/checkpoint.js";
import { processExists } from "../artifacts/process-exists.js";
import { removeWorktree } from "../artifacts/git-workspace.js";
import { loadGitSettings, loadProjectConfig } from "../artifacts/project-config.js";
import { lockHolder } from "../orchestrator/lock.js";
import { clearSession, readSession, runDirectory } from "../orchestrator/session.js";

const FINISHED_STATES = new Set(["SELECT_FR", "FR_COMMIT"]);

function finished(cwd: string, run: string): boolean {
  const events = readFileSync(join(runDirectory(cwd, run), "events.jsonl"), "utf8");
  return events.split("\n").some((line) => {
    if (line === "") return false;
    try {
      const event = JSON.parse(line) as { type?: string; to?: string };
      return event.type === "state_change" && event.to !== undefined && FINISHED_STATES.has(event.to);
    } catch {
      return false;
    }
  });
}

function runsToClean(cwd: string, runId: string | undefined): string[] {
  const runsRoot = resolve(cwd, OID_DIR, "runs");
  return runId === undefined ? (existsSync(runsRoot) ? readdirSync(runsRoot) : []) : [runId];
}

function cleanRun(io: CliIo, root: string, session: ReturnType<typeof readSession>, runId: string, requestedRunId: string | undefined): void {
  const data = runDirectory(io.cwd, runId);
  if (!existsSync(data)) return;

  const replaced = session !== undefined && session.runId !== runId;
  if (requestedRunId === undefined && !finished(io.cwd, runId) && !replaced) {
    io.stdout(`run ${runId} can be resumed; use oid clean --run ${runId}\n`);
    return;
  }

  const path = resolve(root, runId);
  try {
    removeWorktree(io.cwd, { path, branch: "", startCommit: "" });
  } catch (error) {
    io.stderr(`worktree of ${runId} could not be removed: ${String(error)}\n`);
    return;
  }
  rmSync(data, { recursive: true, force: true });
  if (session?.runId === runId) clearSession(io.cwd);
}

/** Removes the worktrees and data of finished runs, leaving their branches intact. */
export function runClean(io: CliIo, runId?: string): number {
  loadProjectConfig(io.cwd);
  const runs = runsToClean(io.cwd, runId);
  const settings = loadGitSettings(io.cwd);
  const root = resolve(io.cwd, settings.worktree_dir, basename(io.cwd));
  const session = readSession(io.cwd);
  const holder = lockHolder(io.cwd);
  if (holder !== undefined && processExists(holder)) return 0;

  for (const run of runs) cleanRun(io, root, session, run, runId);
  return 0;
}
