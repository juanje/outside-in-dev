import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { GIT } from "./git-changes.js";
import { prepareDependencies, runInstall, type Installer } from "./git-dependencies.js";
import { firstLine, NEWLINE } from "./lines.js";
import { ProgressError } from "./progress.js";
import { loadGitSettings } from "./project-config.js";

const TIME_FIELD_WIDTH = 2;
/** The two status letters and the space before the path in a line of `git status --porcelain`. */
const STATUS_PREFIX_LENGTH = 3;

/** Where a run works: the directory, its branch and the commit the user's copy was at when the run started. */
export interface Workspace {
  path: string;
  branch: string;
  startCommit: string;
}

export interface StartOptions {
  runId: string;
  /** The branch name after the prefix; by default `run-` and the start time. */
  name?: string;
  /** When the run starts; by default now. */
  now?: Date;
  /** Installs dependencies in the worktree when it cannot share the main copy's; by default runs the package manager. */
  install?: Installer;
}

/** Runs `git <command> <extra...>` in `cwd` (the command is split on whitespace) and returns its standard output without the final newline; throws with git's message when it fails. */
export function git(cwd: string, command: string, ...extra: string[]): string {
  const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...env } = process.env;
  const result = spawnSync(GIT, [...command.split(/\s+/), ...extra], { cwd, env });
  if (result.status !== 0) throw new Error(`${GIT} ${command} failed: ${result.stderr.toString().trim()}`);
  return result.stdout.toString().trimEnd();
}

/** Whether `ancestor` is `commit` or one of its ancestors in the repository of `cwd`. */
export function isAncestor(cwd: string, ancestor: string, commit: string): boolean {
  const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...env } = process.env;
  return spawnSync(GIT, ["merge-base", "--is-ancestor", ancestor, commit], { cwd, env }).status === 0;
}

/** The commit checked out in `cwd`. */
export function headCommit(cwd: string): string {
  return git(cwd, "rev-parse HEAD");
}

/** The directory of the repository's main working copy, whichever of its worktrees `cwd` is in. */
function mainWorktree(cwd: string): string {
  return firstLine(git(cwd, "worktree list --porcelain")).replace(/^worktree /, "");
}

/** The default name of a run's branch: `run-YYYYMMDD-HHMMSS` in local time. */
function timeName(now: Date): string {
  const pad = (value: number) => String(value).padStart(TIME_FIELD_WIDTH, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  return `run-${date}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/** The files of the copy that are not committed (changed, staged or untracked), ignored files left out. */
export function uncommittedFiles(root: string): string[] {
  return git(root, "status --porcelain --untracked-files=all")
    .split(NEWLINE)
    .filter((line) => line !== "")
    .map((line) => line.slice(STATUS_PREFIX_LENGTH));
}

/** Starts a run on the repository of `cwd`: on a new branch from HEAD, in a worktree or in place, with its dependencies prepared. */
export function startRun(cwd: string, options: StartOptions): Workspace {
  const settings = loadGitSettings(cwd);
  const root = mainWorktree(cwd);
  const branch = `${settings.branch_prefix}${options.name ?? timeName(options.now ?? new Date())}`;
  const startCommit = git(root, "log -1 --format=%H");
  if (settings.isolation === "in_place") {
    const files = uncommittedFiles(root);
    if (files.length > 0) throw new ProgressError(`working in place needs a clean copy, and these files are not committed: ${JSON.stringify(files)}`);
    git(root, "checkout -b", branch);
    return { path: root, branch, startCommit };
  }
  const path = resolve(root, settings.worktree_dir, basename(root), options.runId);
  if (existsSync(path)) throw new ProgressError(`the worktree directory ${path} already exists`);
  git(root, "worktree add -b", branch, path, startCommit);
  prepareDependencies(root, path, options.install ?? runInstall);
  return { path, branch, startCommit };
}

/** Removes the run's worktree directory and unregisters it, even with uncommitted files; the branch stays. */
export function removeWorktree(cwd: string, workspace: Workspace): void {
  git(mainWorktree(cwd), "worktree remove --force", workspace.path);
}
