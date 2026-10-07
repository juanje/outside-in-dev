import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startRun } from "../../src/artifacts/git-workspace.js";
import { ProgressError } from "../../src/artifacts/progress.js";
import { committedRepo, gitIn } from "./git-fixture.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

const git = gitIn;

/** A committed repository with a lockfile and no installed dependencies, so a run has to install its own. */
const repoThatNeedsAnInstall = (): string => committedRepo("app", { "package-lock.json": "{}\n" });

describe("startRun when the dependencies cannot be prepared", () => {
  it("removes the worktree and the branch it created, so the same run can start again", () => {
    const repo = repoThatNeedsAnInstall();
    const failing = () => {
      throw new ProgressError("npm ci failed");
    };
    expect(() => startRun(repo, { runId: "run-1", name: "login", install: failing })).toThrow("npm ci failed");
    expect({ worktree: existsSync(join(dir, ".oid-worktrees", "app", "run-1")), branch: git(repo, "branch", "--list", "oid/login") }).toEqual({ worktree: false, branch: "" });
    const workspace = startRun(repo, { runId: "run-1", name: "login", install: () => undefined });
    expect(git(workspace.path, "branch", "--show-current")).toBe("oid/login");
  });
});
