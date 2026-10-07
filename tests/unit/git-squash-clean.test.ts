import { describe, expect, it } from "vitest";
import { checkpoint } from "../../src/artifacts/git-checkpoints.js";
import { squashFeature } from "../../src/artifacts/git-squash.js";
import { commitAll, git } from "./git-fixture.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

const FEATURE = { id: "FR-AUTH-01", title: "Log in", scenarios: ["Log in"] };

/** A run on oid/login with one checkpoint of the feature: what squashing it should keep. */
function checkpointedRun() {
  write("README.md", "# Project\n");
  commitAll();
  git("checkout", "--quiet", "-b", "oid/login");
  const workspace = { path: dir, branch: "oid/login", startCommit: git("rev-parse", "HEAD") };
  write("src/login.ts", "export const login = 1;\n");
  const last = checkpoint(workspace, { fr: "FR-AUTH-01", state: "tdd_green" });
  return { workspace, last };
}

describe("squashFeature keeps exactly the last checkpoint", () => {
  it("refuses while a file staged after the last checkpoint is in the index, and leaves the branch as it was", () => {
    const { workspace, last } = checkpointedRun();
    write("src/extra.ts", "export const extra = 1;\n");
    git("add", "src/extra.ts");
    expect(() => squashFeature(workspace, { startCommit: workspace.startCommit, ...FEATURE })).toThrow(/src\/extra\.ts/);
    expect(git("rev-parse", "HEAD")).toBe(last);
  });

  it("leaves the branch at its last checkpoint when the commit fails, and the feature's commit has the checkpoint's tree when it does not", () => {
    const { workspace, last } = checkpointedRun();
    git("config", "--unset", "user.email");
    git("config", "user.useConfigOnly", "true");
    const saved = { ...process.env };
    Object.assign(process.env, { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" });
    for (const name of ["GIT_AUTHOR_EMAIL", "GIT_COMMITTER_EMAIL", "EMAIL"]) delete process.env[name];
    try {
      expect(() => squashFeature(workspace, { startCommit: workspace.startCommit, ...FEATURE })).toThrow();
      expect({ head: git("rev-parse", "HEAD"), status: git("status", "--porcelain") }).toEqual({ head: last, status: "" });
    } finally {
      process.env = saved;
    }
    git("config", "user.email", "fixture@example.com");
    const squashed = squashFeature(workspace, { startCommit: workspace.startCommit, ...FEATURE });
    expect({ tree: git("rev-parse", `${squashed}^{tree}`), parent: git("rev-parse", `${squashed}^`) }).toEqual({ tree: git("rev-parse", `${last}^{tree}`), parent: workspace.startCommit });
  });
});
