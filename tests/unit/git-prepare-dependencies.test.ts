import { existsSync, lstatSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { prepareDependencies } from "../../src/artifacts/git-dependencies.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

describe("prepareDependencies", () => {
  it("links node_modules to the main copy's when the lockfiles are identical", () => {
    write("main/package-lock.json", "lock A");
    write("main/node_modules/dep/index.js", "");
    write("tree/package-lock.json", "lock A");
    const installs: string[][] = [];
    prepareDependencies(join(dir, "main"), join(dir, "tree"), (command) => installs.push(command));
    expect(lstatSync(join(dir, "tree/node_modules")).isSymbolicLink()).toBe(true);
    expect(realpathSync(join(dir, "tree/node_modules"))).toBe(realpathSync(join(dir, "main/node_modules")));
    expect(installs).toEqual([]);
  });

  it("installs with the package manager of the lockfile, linking nothing, when the lockfiles differ", () => {
    write("main/package-lock.json", "lock A");
    write("main/node_modules/dep/index.js", "");
    write("tree/package-lock.json", "lock B");
    const installs: Array<{ command: string[]; cwd: string }> = [];
    prepareDependencies(join(dir, "main"), join(dir, "tree"), (command, cwd) => installs.push({ command, cwd }));
    expect(installs).toEqual([{ command: ["npm", "ci"], cwd: join(dir, "tree") }]);
    expect(existsSync(join(dir, "tree/node_modules"))).toBe(false);
  });

  it("does nothing without a lockfile", () => {
    write("main/node_modules/dep/index.js", "");
    write("tree/README.md", "");
    const installs: string[][] = [];
    prepareDependencies(join(dir, "main"), join(dir, "tree"), (command) => installs.push(command));
    expect(installs).toEqual([]);
    expect(existsSync(join(dir, "tree/node_modules"))).toBe(false);
  });
});
