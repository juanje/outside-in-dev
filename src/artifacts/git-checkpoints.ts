import { realpathSync } from "node:fs";
import { HEAD } from "./git-changes.js";
import { git, headCommit, isAncestor, type Workspace } from "./git-workspace.js";
import { ProgressError } from "./progress.js";
import { loadGitSettings } from "./project-config.js";

/** What a checkpoint records: the feature, the state that passed its gate and, optionally, the scenario. */
export interface CheckpointOptions {
  fr: string;
  state: string;
  scenario?: string;
}

const WORD_SEPARATOR = " ";

/** Git options that keep background maintenance from racing with whoever runs next in the repository. */
export const QUIET_COMMIT = "-c maintenance.auto=false -c gc.auto=0 commit --quiet --message";

/** Commits everything the step changed on the run's branch and returns the commit; when nothing changed, returns the current one. */
export function checkpoint(workspace: Workspace, options: CheckpointOptions): string {
  const message = ["oid: checkpoint", options.fr, options.state, options.scenario].filter(Boolean).join(WORD_SEPARATOR);
  requireRunBranch(workspace);
  git(workspace.path, "add -A");
  if (git(workspace.path, "status --porcelain") !== "") git(workspace.path, QUIET_COMMIT, message);
  return headCommit(workspace.path);
}

/** Refuses to touch a checkout that is not this run's: its branch must be a run's branch and the workspace's own, its directory the workspace's, and the run's start must be in its history. The user's work and another run's are never committed to or reset. */
export function requireRunBranch(workspace: Workspace): void {
  const branch = git(workspace.path, "branch --show-current");
  const { branch_prefix: prefix } = loadGitSettings(workspace.path);
  if (!branch.startsWith(prefix)) throw new ProgressError(`the branch "${branch}" is not a run's branch (its name does not start with "${prefix}")`);
  if (branch !== workspace.branch) throw new ProgressError(`the checkout is on the branch "${branch}", not on this run's branch "${workspace.branch}"`);
  const top = git(workspace.path, "rev-parse --show-toplevel");
  if (realpathSync(top) !== realpathSync(workspace.path)) throw new ProgressError(`the run's directory ${workspace.path} is not the top of its checkout (${top})`);
  if (!isAncestor(workspace.path, workspace.startCommit, HEAD)) throw new ProgressError(`the branch "${branch}" does not contain the run's start ${workspace.startCommit}`);
}

/** Refuses a commit that is not on this run's branch since its start. */
function requireRunCommit(workspace: Workspace, commit: string): void {
  if (!isAncestor(workspace.path, workspace.startCommit, commit) || !isAncestor(workspace.path, commit, HEAD)) {
    throw new ProgressError(`${commit} is not a commit of the run's branch "${workspace.branch}" since its start`);
  }
}

/** Returns the run to a checkpoint: discards every change to tracked files and removes the untracked files inside the globs; ignored files are left alone. */
export function rollback(workspace: Workspace, commit: string, writeGlobs: string[]): void {
  requireRunBranch(workspace);
  requireRunCommit(workspace, commit);
  git(workspace.path, "reset --hard", commit);
  if (writeGlobs.length > 0) git(workspace.path, "clean -fd --", ...writeGlobs);
}
