import { QUIET_COMMIT, requireRunBranch } from "./git-checkpoints.js";
import { git, headCommit, type Workspace } from "./git-workspace.js";
import { NEWLINE } from "./lines.js";
import { ProgressError } from "./progress.js";
import { loadGitSettings } from "./project-config.js";

/** The feature a run finished: where its work started, its requirement and the scenarios it made pass. */
export interface SquashOptions {
  startCommit: string;
  id: string;
  title: string;
  scenarios: string[];
}

const COMMIT_TYPE = "feat";
/** The position of the area in a requirement ID such as `FR-AUTH-01`. */
const AREA_PART = 1;

/** Fills the commit template: the type, the ID's area in lower case, the ID and the title. */
function commitSubject(template: string, options: SquashOptions): string {
  const values = { type: COMMIT_TYPE, scope: options.id.split("-")[AREA_PART].toLowerCase(), id: options.id, title: options.title };
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => values[name as keyof typeof values] ?? placeholder);
}

/** Replaces the feature's checkpoints with one commit that names the requirement and lists its scenarios; returns that commit. */
export function squashFeature(workspace: Workspace, options: SquashOptions): string {
  requireRunBranch(workspace);
  if (headCommit(workspace.path) === options.startCommit) throw new ProgressError("nothing to squash: the branch has no commit since the start of the feature");
  const subject = commitSubject(loadGitSettings(workspace.path).commit_template, options);
  git(workspace.path, "reset --soft", options.startCommit);
  git(workspace.path, QUIET_COMMIT, subject, "--message", options.scenarios.map((name) => `- ${name}`).join(NEWLINE));
  return headCommit(workspace.path);
}
