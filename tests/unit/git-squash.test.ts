import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkpoint } from "../../src/artifacts/git-checkpoints.js";
import { squashFeature } from "../../src/artifacts/git-squash.js";
import { commitAll, git } from "./git-fixture.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

/** A committed repository in the temporary project, on a branch of a run, with two checkpoints of a feature. */
function finishedFeature() {
  write("README.md", "# Project\n");
  commitAll();
  git("checkout", "-b", "oid/login");
  const workspace = { path: dir, branch: "oid/login", startCommit: git("rev-parse", "HEAD") };
  write("src/login.ts", "first\n");
  checkpoint(workspace, { fr: "FR-AUTH-01", state: "bdd_red" });
  write("src/login.ts", "second\n");
  checkpoint(workspace, { fr: "FR-AUTH-01", state: "tdd_green" });
  return workspace;
}

describe("squashFeature", () => {
  it("replaces the checkpoints with one commit named after the requirement and listing the scenarios", () => {
    const workspace = finishedFeature();
    const hash = squashFeature(workspace, { startCommit: workspace.startCommit, id: "FR-AUTH-01", title: "Log in", scenarios: ["Log in", "Wrong password"] });
    expect(hash).toBe(git("rev-parse", "HEAD"));
    expect(git("rev-list", "--count", `${workspace.startCommit}..HEAD`)).toBe("1");
    expect(git("log", "-1", "--format=%s")).toBe("feat(auth): FR-AUTH-01 Log in");
    expect(git("log", "-1", "--format=%b")).toBe("- Log in\n- Wrong password");
    expect(readFileSync(join(dir, "src/login.ts"), "utf8")).toBe("second\n");
  });
});

describe("squashFeature with nothing to squash", () => {
  it("refuses, saying so, and leaves the branch as it was", () => {
    const workspace = finishedFeature();
    const head = git("rev-parse", "HEAD");
    expect(() => squashFeature(workspace, { startCommit: head, id: "FR-AUTH-01", title: "Log in", scenarios: ["Log in"] })).toThrow("nothing to squash");
    expect(git("rev-parse", "HEAD")).toBe(head);
  });
});

describe("squashFeature on a branch that is not a run's", () => {
  it("refuses, naming the branch, and rewrites nothing", () => {
    const workspace = finishedFeature();
    git("checkout", "-");
    const branch = git("branch", "--show-current");
    const head = git("rev-parse", "HEAD");
    expect(() => squashFeature({ ...workspace, branch }, { startCommit: workspace.startCommit, id: "FR-AUTH-01", title: "Log in", scenarios: ["Log in"] })).toThrow(`"${branch}"`);
    expect(git("rev-parse", "HEAD")).toBe(head);
  });
});
