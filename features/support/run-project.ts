import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import type { OidWorld } from "./world.js";

/** Runs `git` in `cwd` and returns its trimmed output; a failing git fails the step. */
export function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

export type Worktree = { path: string; branch: string };

export function worktrees(world: OidWorld): Worktree[] {
  const blocks = git(world.projectDir, "worktree", "list", "--porcelain").split("\n\n");
  return blocks.map((block) => {
    const lines = block.split("\n");
    return { path: lines[0]!.replace("worktree ", ""), branch: (lines.find((line) => line.startsWith("branch ")) ?? "").replace("branch refs/heads/", "") };
  });
}

export function runWorktree(world: OidWorld): Worktree {
  const [, created] = worktrees(world);
  assert.ok(created, "the run created no worktree");
  return created;
}
