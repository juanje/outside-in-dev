import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkpoint, rollback } from "../../src/artifacts/git-checkpoints.js";
import { commitAll, git } from "./git-fixture.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

/** A committed repository in the temporary project, on a branch of a run. */
function runWorkspace() {
  write("README.md", "# Project\n");
  commitAll();
  git("checkout", "-b", "oid/login");
  return { path: dir, branch: "oid/login", startCommit: git("rev-parse", "HEAD") };
}

describe("checkpoint", () => {
  it("commits every change on the work branch under a message naming the feature, the state and the scenario", () => {
    const workspace = runWorkspace();
    write("src/login.ts", "export {};\n");
    const hash = checkpoint(workspace, { fr: "FR-AUTH-01", state: "bdd_red", scenario: "Log in" });
    expect(hash).toBe(git("rev-parse", "HEAD"));
    expect(git("log", "-1", "--format=%s")).toBe("oid: checkpoint FR-AUTH-01 bdd_red Log in");
    expect(git("show", "--name-only", "--format=", "HEAD")).toBe("src/login.ts");
  });

  it("returns the current commit without making a new one when nothing changed", () => {
    const workspace = runWorkspace();
    const hash = checkpoint(workspace, { fr: "FR-AUTH-01", state: "select" });
    expect(hash).toBe(workspace.startCommit);
    expect(git("rev-list", "--count", `${workspace.startCommit}..HEAD`)).toBe("0");
  });
});

describe("on a branch that is not a run's", () => {
  it("refuses a rollback, naming the branch, and leaves the copy as it was", () => {
    const workspace = runWorkspace();
    git("checkout", "-");
    write("src/notes.ts", "notes\n");
    const own = { ...workspace, branch: git("branch", "--show-current") };
    expect(() => rollback(own, workspace.startCommit, ["src/**"])).toThrow(own.branch);
    expect(existsSync(join(dir, "src/notes.ts"))).toBe(true);
  });
});

describe("checkpoint on a branch that is not a run's", () => {
  it("refuses, naming the branch, and commits nothing", () => {
    const workspace = runWorkspace();
    git("checkout", "-");
    write("src/notes.ts", "notes\n");
    const branch = git("branch", "--show-current");
    expect(() => checkpoint({ ...workspace, branch }, { fr: "FR-AUTH-01", state: "select" })).toThrow(branch);
    expect(git("rev-parse", "HEAD")).toBe(workspace.startCommit);
  });
});

describe("rollback", () => {
  it("returns to the commit, discarding edits and removing untracked files only inside the globs", () => {
    const workspace = runWorkspace();
    write("src/login.ts", "kept\n");
    const hash = checkpoint(workspace, { fr: "FR-AUTH-01", state: "tdd_green" });
    write("src/login.ts", "edited\n");
    write("src/extra.ts", "extra\n");
    write("notes/todo.txt", "todo\n");
    rollback(workspace, hash, ["src/**"]);
    expect(readFileSync(join(dir, "src/login.ts"), "utf8")).toBe("kept\n");
    expect(existsSync(join(dir, "src/extra.ts"))).toBe(false);
    expect(existsSync(join(dir, "notes/todo.txt"))).toBe(true);
    expect(git("rev-parse", "HEAD")).toBe(hash);
  });

  it("removes no untracked file when the step may write nowhere", () => {
    const workspace = runWorkspace();
    write("src/extra.ts", "extra\n");
    rollback(workspace, workspace.startCommit, []);
    expect(existsSync(join(dir, "src/extra.ts"))).toBe(true);
  });
});
