import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const GIT_DIRECTORY = ".git";

/** Every file under `root`, by path relative to it, with its content. Symbolic links are not followed: a fixture project links `node_modules` to oid's, and reading it on every run cost gigabytes. The `.git` directory is left out: it is not part of the project, and git's background maintenance creates and removes files in it while the scenario runs. */
export function projectFiles(root: string, prefix = ""): Map<string, string> {
  const files = new Map<string, string>();
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const rel = join(prefix, entry.name);
    if (entry.name === GIT_DIRECTORY) continue;
    if (entry.isDirectory()) for (const [path, text] of projectFiles(root, rel)) files.set(path, text);
    else if (entry.isFile()) files.set(rel, readFileSync(join(root, rel), "utf8"));
  }
  return files;
}
