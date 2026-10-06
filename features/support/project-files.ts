import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Every file under `root`, by path relative to it, with its content. Symbolic links are not followed: a fixture project links `node_modules` to oid's, and reading it on every run cost gigabytes. */
export function projectFiles(root: string, prefix = ""): Map<string, string> {
  const files = new Map<string, string>();
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const rel = join(prefix, entry.name);
    if (entry.isDirectory()) for (const [path, text] of projectFiles(root, rel)) files.set(path, text);
    else if (entry.isFile()) files.set(rel, readFileSync(join(root, rel), "utf8"));
  }
  return files;
}
