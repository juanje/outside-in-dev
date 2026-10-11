import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkpoint, shelveWork } from "../../src/artifacts/git-checkpoints.js";
import { commitAll, git } from "./git-fixture.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

describe("shelveWork", () => {
  it("keeps everything done since a commit in one commit under a ref, and returns the branch and the files to that commit", () => {
    write("README.md", "# Project\n");
    commitAll();
    git("checkout", "-b", "oid/login");
    const workspace = { path: dir, branch: "oid/login", startCommit: git("rev-parse", "HEAD") };
    write("notes/a.txt", "first\n");
    const back = checkpoint(workspace, { fr: "FR-AUTH-01", state: "bdd_red" });
    write("notes/a.txt", "second\n");
    checkpoint(workspace, { fr: "FR-AUTH-01", state: "tdd_green" });
    write("notes/b.txt", "not committed\n");
    const kept = shelveWork(workspace, { to: back, ref: "refs/oid/wip/run-1/FR-AUTH-01/1", message: "wip(auth): FR-AUTH-01 Log in" });
    expect({
      head: git("rev-parse", "HEAD"),
      files: [readFileSync(join(dir, "notes/a.txt"), "utf8"), existsSync(join(dir, "notes/b.txt"))],
      ref: git("rev-parse", "refs/oid/wip/run-1/FR-AUTH-01/1"),
      subject: git("log", "-1", "--format=%s", kept),
      tree: git("ls-tree", "-r", "--name-only", kept).split("\n"),
      content: git("show", `${kept}:notes/a.txt`),
    }).toEqual({ head: back, files: ["first\n", false], ref: kept, subject: "wip(auth): FR-AUTH-01 Log in", tree: ["README.md", "notes/a.txt", "notes/b.txt"], content: "second" });
  });
});
