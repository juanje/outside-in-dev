import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { rollback } from "../../src/artifacts/git-checkpoints.js";
import { squashFeature } from "../../src/artifacts/git-squash.js";
import { ProgressError } from "../../src/artifacts/progress.js";
import { commitAll, git } from "./git-fixture.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

/** A run's workspace on oid/login whose checkout was then switched to another run's branch, oid/other, with work of its own. */
function checkoutOnAnotherRun() {
  write("README.md", "# Project\n");
  commitAll();
  git("checkout", "-b", "oid/login");
  const workspace = { path: dir, branch: "oid/login", startCommit: git("rev-parse", "HEAD") };
  write("src/login.ts", "export const login = 1;\n");
  git("add", "-A");
  git("commit", "--quiet", "--message", "oid: checkpoint FR-AUTH-01 tdd_green");
  git("checkout", "--quiet", "-b", "oid/other", workspace.startCommit);
  write("src/other.ts", "export const other = 1;\n");
  git("add", "-A");
  git("commit", "--quiet", "--message", "other run's work");
  write("src/other.ts", "export const other = 2;\n");
  return workspace;
}

describe("a run's destructive operations check that the checkout is that run's", () => {
  it("refuses a rollback when the checkout is on another run's branch, and discards nothing of it", () => {
    const workspace = checkoutOnAnotherRun();
    expect(() => rollback(workspace, workspace.startCommit, ["src/**"])).toThrow(ProgressError);
    expect({ branch: git("branch", "--show-current"), other: readFileSync(join(dir, "src/other.ts"), "utf8") }).toEqual({ branch: "oid/other", other: "export const other = 2;\n" });
  });

  it("refuses a squash when the checkout is on another run's branch, and rewrites nothing", () => {
    const workspace = checkoutOnAnotherRun();
    const head = git("rev-parse", "HEAD");
    expect(() => squashFeature(workspace, { startCommit: workspace.startCommit, id: "FR-AUTH-01", title: "Log in", scenarios: ["Log in"] })).toThrow(ProgressError);
    expect(git("rev-parse", "HEAD")).toBe(head);
  });

  it("refuses a rollback to a commit that is not on the run's branch since its start", () => {
    write("README.md", "# Project\n");
    commitAll();
    const before = git("rev-parse", "HEAD");
    write("CHANGELOG.md", "- one\n");
    git("add", "-A");
    git("commit", "--quiet", "--message", "user's work");
    git("checkout", "--quiet", "-b", "oid/login");
    const workspace = { path: dir, branch: "oid/login", startCommit: git("rev-parse", "HEAD") };
    git("branch", "elsewhere", before);
    git("checkout", "--quiet", "elsewhere");
    write("NOTES.md", "elsewhere\n");
    git("add", "-A");
    git("commit", "--quiet", "--message", "elsewhere");
    const foreign = git("rev-parse", "HEAD");
    git("checkout", "--quiet", "oid/login");
    expect(() => rollback(workspace, before, [])).toThrow(/is not a commit of the run's branch/);
    expect(() => rollback(workspace, foreign, [])).toThrow(/is not a commit of the run's branch/);
    expect(git("rev-parse", "HEAD")).toBe(workspace.startCommit);
  });

  it("refuses a workspace whose directory is not the top of its checkout", () => {
    write("README.md", "# Project\n");
    write("src/a.ts", "export const a = 1;\n");
    commitAll();
    git("checkout", "--quiet", "-b", "oid/login");
    const workspace = { path: join(dir, "src"), branch: "oid/login", startCommit: git("rev-parse", "HEAD") };
    expect(() => rollback(workspace, workspace.startCommit, [])).toThrow(/is not the top of its checkout/);
  });
});
