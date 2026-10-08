import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ProgressError } from "./progress.js";
import { countLines, type LineRange, parseChangedLines } from "./changed-lines.js";

/** The git executable. */
export const GIT = "git";
/** The commit checked out. */
export const HEAD = "HEAD";

/** The lines added or modified in the working tree of `cwd` since `since` (HEAD by default), staged or not, by file path; a file git does not track yet counts as changed in every line. */
export function readChangedLines(cwd: string, since = HEAD): Map<string, LineRange[]> {
  const inside = spawnSync(GIT, ["rev-parse", "--is-inside-work-tree"], { cwd, encoding: "utf8" });
  if (inside.status !== 0) throw new ProgressError("--changed needs a git repository, and this directory is not a git repository");
  const head = spawnSync(GIT, ["rev-parse", "--verify", "--quiet", HEAD], { cwd, encoding: "utf8" });
  if (head.status !== 0) throw new ProgressError("--changed compares with HEAD, and this git repository has no commits yet");
  const diff = spawnSync(GIT, ["diff", "--unified=0", "--no-color", "--relative", since], { cwd, encoding: "utf8" });
  const changed = parseChangedLines(diff.stdout);
  const untracked = spawnSync(GIT, ["ls-files", "--others", "--exclude-standard", "-z"], { cwd, encoding: "utf8" });
  for (const file of untracked.stdout.split("\0").filter((name) => name !== "")) {
    const lines = countLines(readFileSync(join(cwd, file), "utf8"));
    if (lines > 0) changed.set(file, [{ start: 1, end: lines }]);
  }
  return changed;
}
