import { spawnSync } from "node:child_process";
import { dir } from "./temp-project.js";

/** Runs git in the temporary project, never in the repository under test, and returns its trimmed standard output. */
export function git(...args: string[]): string {
  const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...env } = process.env;
  const run = spawnSync("git", args, { cwd: dir, env, encoding: "utf8" });
  if (run.status !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr}`);
  return run.stdout.trim();
}

/** Makes the temporary project a git repository with everything in it committed. */
export function commitAll(): void {
  git("init", "--quiet");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.com");
  git("add", "-A");
  git("commit", "--quiet", "--message", "fixture");
}
