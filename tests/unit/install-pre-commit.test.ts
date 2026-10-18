import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commitAll } from "./git-fixture.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

const SCRIPT = join(import.meta.dirname, "..", "..", "scripts", "install-pre-commit.mjs");
const PRE_COMMIT = join(import.meta.dirname, "..", "..", "scripts", "pre-commit");

describe("the pre-commit installer", () => {
  it("installs scripts/pre-commit as the executable pre-commit hook of the repository it runs in", () => {
    write("a.txt", "a\n");
    commitAll();
    const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...env } = process.env;
    const run = spawnSync(process.execPath, [SCRIPT], { cwd: dir, env, encoding: "utf8" });
    const hook = join(dir, ".git", "hooks", "pre-commit");
    expect({ status: run.status, installed: existsSync(hook) }).toEqual({ status: 0, installed: true });
    expect({ same: readFileSync(hook, "utf8") === readFileSync(PRE_COMMIT, "utf8"), executable: (statSync(hook).mode & 0o111) !== 0 }).toEqual({ same: true, executable: true });
  });
});
