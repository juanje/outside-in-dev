import { describe, expect, it } from "vitest";
import { loadGitSettings } from "../../src/artifacts/project-config.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

describe("loadGitSettings", () => {
  it("defaults to a worktree, the oid/ prefix and the conventional commit template without a configuration file", () => {
    expect(loadGitSettings(dir)).toEqual({
      isolation: "worktree",
      worktree_dir: "../.oid-worktrees",
      branch_prefix: "oid/",
      commit_template: "{type}({scope}): {id} {title}",
    });
  });
});
