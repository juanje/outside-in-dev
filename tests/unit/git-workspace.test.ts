import { join } from "node:path";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { removeWorktree, startRun } from "../../src/artifacts/git-workspace.js";
import { committedRepo, gitIn } from "./git-fixture.js";
import { dir, useTempDir, write, writeMinimalConfig } from "./temp-project.js";

useTempDir();

const noInstall = () => undefined;

const git = gitIn;

/** A committed repository named "project" inside the temporary project; returns its path. */
const projectRepo = (): string => committedRepo("project", { "README.md": "# Project\n" });

describe("startRun", () => {
  it("creates the worktree beside the repository on a new branch from HEAD and reports it", () => {
    const repo = projectRepo();
    const head = git(repo, "rev-parse", "HEAD");
    const workspace = startRun(repo, { runId: "run-1", name: "login", install: noInstall });
    expect(workspace.branch).toBe("oid/login");
    expect(workspace.startCommit).toBe(head);
    expect(realpathSync(workspace.path)).toBe(realpathSync(join(dir, ".oid-worktrees", "project", "run-1")));
    expect(git(workspace.path, "branch", "--show-current")).toBe("oid/login");
    expect(git(workspace.path, "rev-parse", "HEAD")).toBe(head);
  });

  it("names the branch after the time the run starts when no name is given", () => {
    const repo = projectRepo();
    const workspace = startRun(repo, { runId: "run-1", now: new Date(2026, 9, 7, 13, 45, 9), install: noInstall });
    expect(workspace.branch).toBe("oid/run-20261007-134509");
  });

  it("refuses a worktree directory that already exists and creates no branch", () => {
    const repo = projectRepo();
    mkdirSync(join(dir, ".oid-worktrees", "project", "run-1"), { recursive: true });
    expect(() => startRun(repo, { runId: "run-1", name: "login", install: noInstall })).toThrow(/run-1/);
    expect(git(repo, "branch", "--list", "oid/login")).toBe("");
  });

  it("refuses to work in place on a copy with untracked changes, naming them, and creates no branch", () => {
    const repo = projectRepo();
    writeMinimalConfig({ settings: { isolation: "in_place" } }, "project");
    git(repo, "add", "-A");
    git(repo, "commit", "--quiet", "--message", "configure");
    write("project/notes.txt", "notes\n");
    expect(() => startRun(repo, { runId: "run-1", name: "login", install: noInstall })).toThrow(/notes\.txt/);
    expect(git(repo, "branch", "--list", "oid/login")).toBe("");
  });

  it("works in place on a clean copy by creating and checking out the branch there", () => {
    const repo = projectRepo();
    writeMinimalConfig({ settings: { isolation: "in_place" } }, "project");
    git(repo, "add", "-A");
    git(repo, "commit", "--quiet", "--message", "configure");
    const head = git(repo, "rev-parse", "HEAD");
    const workspace = startRun(repo, { runId: "run-1", name: "login", install: noInstall });
    expect(workspace).toEqual({ path: repo, branch: "oid/login", startCommit: head });
    expect(git(repo, "branch", "--show-current")).toBe("oid/login");
    expect(existsSync(join(dir, ".oid-worktrees"))).toBe(false);
  });
});

describe("removeWorktree", () => {
  it("removes the run's directory and unregisters it, keeping its branch", () => {
    const repo = projectRepo();
    const workspace = startRun(repo, { runId: "run-1", name: "login", install: noInstall });
    removeWorktree(repo, workspace);
    expect(existsSync(workspace.path)).toBe(false);
    expect(git(repo, "worktree", "list")).not.toContain("run-1");
    expect(git(repo, "branch", "--list", "oid/login")).toContain("oid/login");
  });
});
