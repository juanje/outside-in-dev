import { readdirSync } from "node:fs";
import { join } from "node:path";
import { OID_DIR } from "../artifacts/checkpoint.js";
import { matchesGlob } from "./containment.js";

/** The directories no listing of the project enters. */
const SKIPPED = new Set([".git", "node_modules", OID_DIR]);

/** The most files a listing holds. */
const MAX_LISTED_FILES = 3;

/** Up to `MAX_LISTED_FILES` files of the worktree that match one of the globs, in the order of the directory listing, as paths relative to the worktree. */
export function filesMatching(worktree: string, globs: string[]): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(join(worktree, directory), { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (found.length >= MAX_LISTED_FILES || SKIPPED.has(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (globs.some((glob) => matchesGlob(path, glob))) found.push(path);
    }
  };
  walk("");
  return found;
}
