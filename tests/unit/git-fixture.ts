import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { dir, write } from "./temp-project.js";

/** Runs git in the temporary project, never in the repository under test, and returns its trimmed standard output. */
export function git(...args: string[]): string {
  return gitIn(dir, ...args);
}

/** Makes the temporary project a git repository with everything in it committed. */
export function commitAll(): void {
  git("init", "--quiet");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.com");
  git("add", "-A");
  git("commit", "--quiet", "--message", "fixture");
}

/** Runs git in `cwd`, a directory of the temporary project, and returns its trimmed standard output. */
export function gitIn(cwd: string, ...args: string[]): string {
  const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...env } = process.env;
  const run = spawnSync("git", args, { cwd, env, encoding: "utf8" });
  if (run.status !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr}`);
  return run.stdout.trim();
}

/** Makes `name`, a directory of the temporary project with `files` in it, a repository with them committed; returns its path. */
export function committedRepo(name: string, files: Record<string, string>): string {
  const repo = join(dir, name);
  for (const [file, text] of Object.entries(files)) write(`${name}/${file}`, text);
  gitIn(repo, "init", "--quiet");
  gitIn(repo, "config", "user.name", "Fixture");
  gitIn(repo, "config", "user.email", "fixture@example.com");
  gitIn(repo, "add", "-A");
  gitIn(repo, "commit", "--quiet", "--message", "fixture");
  return repo;
}
