import { AfterAll } from "@cucumber/cucumber";
import { createHash, type Hash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The fixture repositories this worker has built, by the digest of the whole chain of commits that made them. Each is read-only once built: a scenario copies it and never runs in it. */
const templates = new Map<string, string>();

/** The digest of every file under `dir` except `.git` (a symlink counts by its target), so two trees with the same digest are the same fixture. */
function treeDigest(dir: string): string {
  const hash = createHash("sha1");
  addTree(dir, hash, "");
  return hash.digest("hex");
}

function addTree(dir: string, hash: Hash, prefix: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (prefix === "" && entry.name === ".git") continue;
    const path = join(dir, entry.name);
    hash.update(`${prefix}${entry.name}\0`);
    if (entry.isSymbolicLink()) hash.update(`->${readlinkSync(path)}\0`);
    else if (entry.isDirectory()) addTree(path, hash, `${prefix}${entry.name}/`);
    else hash.update(readFileSync(path)).update("\0");
  }
}

/** The key of the commit a fixture is about to make: the key of the commit before it, the tree about to be committed, and what else decides the commit. */
export function commitKey(before: string, projectDir: string, extra: string): string {
  return createHash("sha1").update(before).update("\0").update(extra).update("\0").update(treeDigest(projectDir)).digest("hex");
}

/** Replaces `projectDir` by a copy of the template for `key`; false when this worker has not built that fixture yet. */
export function restoreTemplate(key: string, projectDir: string): boolean {
  const template = templates.get(key);
  if (template === undefined) return false;
  rmSync(projectDir, { recursive: true, force: true });
  cpSync(template, projectDir, { recursive: true, preserveTimestamps: true });
  return true;
}

/** Keeps a copy of the committed fixture as the template for `key`. A repository with a worktree records absolute paths, so it is never kept. */
export function saveTemplate(key: string, projectDir: string): void {
  if (existsSync(join(projectDir, ".git", "worktrees")) || !lstatSync(projectDir).isDirectory()) return;
  const template = mkdtempSync(join(tmpdir(), "oid-template-"));
  cpSync(projectDir, template, { recursive: true, preserveTimestamps: true });
  templates.set(key, template);
}

AfterAll(function () {
  for (const template of templates.values()) rmSync(template, { recursive: true, force: true });
  templates.clear();
});
