import { git, type Workspace } from "./git-workspace.js";
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
const QUIET_COMMIT = "-c maintenance.auto=false -c gc.auto=0 commit --quiet --message";

/** Commits everything the step changed on the run's branch and returns the commit; when nothing changed, returns the current one. */
export function checkpoint(workspace: Workspace, options: CheckpointOptions): string {
  const message = ["oid: checkpoint", options.fr, options.state, options.scenario].filter(Boolean).join(WORD_SEPARATOR);
  requireRunBranch(workspace);
  git(workspace.path, "add -A");
  if (git(workspace.path, "status --porcelain") !== "") git(workspace.path, QUIET_COMMIT, message);
  return git(workspace.path, "rev-parse HEAD");
}

/** Refuses to touch a branch that is not a run's: the user's own work is never committed to or reset. */
function requireRunBranch(workspace: Workspace): void {
  const branch = git(workspace.path, "branch --show-current");
  const { branch_prefix: prefix } = loadGitSettings(workspace.path);
  if (!branch.startsWith(prefix)) throw new ProgressError(`the branch "${branch}" is not a run's branch (its name does not start with "${prefix}")`);
}

/** Returns the run to a checkpoint: discards every change to tracked files and removes the untracked files inside the globs; ignored files are left alone. */
export function rollback(workspace: Workspace, commit: string, writeGlobs: string[]): void {
  requireRunBranch(workspace);
  git(workspace.path, "reset --hard", commit);
  if (writeGlobs.length > 0) git(workspace.path, "clean -fd --", ...writeGlobs);
}
