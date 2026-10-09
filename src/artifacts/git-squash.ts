import { requireRunBranch } from "./git-checkpoints.js";
import { git, headCommit, uncommittedFiles, type Workspace } from "./git-workspace.js";
import { NEWLINE } from "./lines.js";
import { ProgressError } from "./progress.js";
import { loadGitSettings } from "./project-config.js";

/** The feature a run finished: where its work started, its requirement and the scenarios it made pass. */
export interface SquashOptions {
  startCommit: string;
  id: string;
  title: string;
  scenarios: string[];
  /** Files the commit leaves out because they belong to a feature still to do: each is as it was where this feature started, and stays in the working copy, staged. */
  leave?: string[];
}

const COMMIT_TYPE = "feat";
/** What ends the options of a git command and starts its paths. */
const PATHS = "--";
/** The position of the area in a requirement ID such as `FR-AUTH-01`. */
const AREA_PART = 1;

/** Fills the commit template: the type, the ID's area in lower case, the ID and the title. */
function commitSubject(template: string, options: SquashOptions): string {
  const values = { type: COMMIT_TYPE, scope: options.id.split("-")[AREA_PART].toLowerCase(), id: options.id, title: options.title };
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => values[name as keyof typeof values] ?? placeholder);
}

/** The tree of the last checkpoint with the files of `leave` as they were at `startCommit` (absent when they did not exist). The index is left as the last checkpoint had it, also when this fails. */
function treeLeaving(cwd: string, last: string, startCommit: string, leave: string[]): string {
  if (leave.length === 0) return `${last}^{tree}`;
  try {
    for (const path of leave) {
      if (git(cwd, "ls-tree", startCommit, PATHS, path) === "") git(cwd, "rm --cached --quiet --ignore-unmatch", PATHS, path);
      else git(cwd, "reset --quiet", startCommit, PATHS, path);
    }
    return git(cwd, "write-tree");
  } finally {
    git(cwd, "reset --quiet", last, PATHS, ...leave);
  }
}

/** Replaces the feature's checkpoints with one commit that names the requirement and lists its scenarios; returns that commit. */
export function squashFeature(workspace: Workspace, options: SquashOptions): string {
  requireRunBranch(workspace);
  const files = uncommittedFiles(workspace.path);
  if (files.length > 0) throw new ProgressError(`squashing needs the run's copy as its last checkpoint left it, and these files are not committed: ${JSON.stringify(files)}`);
  if (headCommit(workspace.path) === options.startCommit) throw new ProgressError("nothing to squash: the branch has no commit since the start of the feature");
  const subject = commitSubject(loadGitSettings(workspace.path).commit_template, options);
  const last = headCommit(workspace.path);
  // The feature's commit is built from the last checkpoint's tree, never from the index, and the branch moves only
  // once it exists: a commit that fails leaves the branch, the index and the files as they were.
  const squashed = git(workspace.path, "commit-tree", treeLeaving(workspace.path, last, options.startCommit, options.leave ?? []), "-p", options.startCommit, "-m", subject, "-m", options.scenarios.map((name) => `- ${name}`).join(NEWLINE));
  git(workspace.path, "update-ref", `refs/heads/${workspace.branch}`, squashed, last);
  return squashed;
}
