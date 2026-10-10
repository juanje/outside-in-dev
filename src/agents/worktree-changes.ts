import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { git } from "../artifacts/git-workspace.js";

const NUL = "\0";
const ABSENT = "absent";
const DIRECTORY = "directory";
const LINK_PREFIX = "link:";

/** What a worktree held when an attempt started: the files that differed from HEAD, each with a fingerprint of its content. */
export type WorktreeSnapshot = Map<string, string>;

function digest(content: string | Buffer): string {
  return createHash("sha1").update(content).digest("hex");
}

/** A file by its content, a link by its target (never followed), a directory by a fixed marker, a missing path as absent. */
function fingerprint(cwd: string, file: string): string {
  const path = join(cwd, file);
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat === undefined) return ABSENT;
  if (stat.isSymbolicLink()) return digest(`${LINK_PREFIX}${readlinkSync(path)}`);
  return stat.isDirectory() ? DIRECTORY : digest(readFileSync(path));
}

/** The files that differ from HEAD: tracked ones changed or deleted, staged or not, and untracked ones that are not ignored. */
function dirtyFiles(cwd: string): string[] {
  const tracked = git(cwd, "diff --name-only -z --relative HEAD");
  const untracked = git(cwd, "ls-files --others --exclude-standard -z");
  return [...new Set([...tracked.split(NUL), ...untracked.split(NUL)].filter((file) => file !== ""))];
}

/** Records the state of the worktree before an agent works. */
export function snapshotWorktree(cwd: string): WorktreeSnapshot {
  return new Map(dirtyFiles(cwd).map((file) => [file, fingerprint(cwd, file)]));
}

/** The files the agent changed, added or deleted since `before`, untracked ones included, sorted. A file that was dirty before and holds the same content now is not one of them; one that went back to HEAD is. */
export function changesSince(cwd: string, before: WorktreeSnapshot): string[] {
  const now = dirtyFiles(cwd);
  const changed = now.filter((file) => before.get(file) !== fingerprint(cwd, file));
  const reverted = [...before.keys()].filter((file) => !now.includes(file));
  return [...changed, ...reverted].sort();
}
