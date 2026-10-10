import { changesFromHead } from "./checkpoint.js";
import { isInsideSource } from "./source-roots.js";

/** The files that exist and differ from HEAD (modified, added, or untracked and not ignored), sorted, that lie under the fixed directory of one of `globs`: the code a linter is asked about. */
export function changedCodeFiles(cwd: string, globs: string[]): string[] {
  return changesFromHead(cwd)
    .present.filter((name) => isInsideSource(globs, name))
    .sort();
}
