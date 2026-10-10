import { describe, expect, it } from "vitest";
import { existsSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { installCommand, prepareDependencies, runInstall } from "../../src/artifacts/git-dependencies.js";
import { committedRepo, gitIn } from "./git-fixture.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

describe("installCommand", () => {
  it("installs a package-lock.json with npm ci", () => {
    write("package-lock.json", "{}");
    expect(installCommand(dir)).toEqual(["npm", "ci"]);
  });

  it("installs a pnpm-lock.yaml with pnpm install --frozen-lockfile", () => {
    write("pnpm-lock.yaml", "lockfileVersion: 9");
    expect(installCommand(dir)).toEqual(["pnpm", "install", "--frozen-lockfile"]);
  });

  it("installs a yarn.lock with yarn install --frozen-lockfile", () => {
    write("yarn.lock", "# yarn lockfile v1");
    expect(installCommand(dir)).toEqual(["yarn", "install", "--frozen-lockfile"]);
  });
});

describe("prepareDependencies", () => {
  it("hides the shared node_modules link from git even when the project ignores only directories", () => {
    const main = committedRepo("main", { "package-lock.json": "lock\n", ".gitignore": "node_modules/\n", "node_modules/dep/index.js": "1\n" });
    const worktree = join(dir, "wt");
    gitIn(main, "worktree", "add", "--quiet", "-b", "run", worktree);

    prepareDependencies(main, worktree, () => undefined);

    expect(lstatSync(join(worktree, "node_modules")).isSymbolicLink()).toBe(true);
    expect(gitIn(worktree, "status", "--porcelain", "--untracked-files=all")).toBe("");
  });
});

describe("runInstall", () => {
  it("runs the command in the directory", () => {
    runInstall([process.execPath, "-e", "require('node:fs').writeFileSync('ran.txt', '')"], dir);
    expect(existsSync(join(dir, "ran.txt"))).toBe(true);
  });

  it("fails naming the command when it exits with an error", () => {
    expect(() => runInstall([process.execPath, "-e", "process.exit(3)"], dir)).toThrow(/-e.*exit/);
  });
});
