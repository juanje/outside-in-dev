import { mkdirSync, mkdtempSync, realpathSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { locate, matchesGlob } from "../../src/agents/containment.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

describe("locate", () => {
  it("resolves symlinks, '..' and paths that do not exist yet against the worktree", () => {
    write("progress.json", "{}");
    write("src/a.ts", "");
    mkdirSync(join(dir, "features"));
    const outside = mkdtempSync(join(tmpdir(), "oid-outside-"));
    symlinkSync("../progress.json", join(dir, "src/state.json"));
    symlinkSync(outside, join(dir, "src/outside"));
    const root = realpathSync(dir);

    expect(locate(dir, "src/a.ts")).toEqual({ real: join(root, "src/a.ts"), relative: "src/a.ts", inside: true });
    expect(locate(dir, "src/new/deeper.ts")).toMatchObject({ relative: "src/new/deeper.ts", inside: true });
    expect(locate(dir, join(dir, "src/a.ts"))).toMatchObject({ relative: "src/a.ts", inside: true });
    expect(locate(dir, "@src/a.ts")).toMatchObject({ relative: "src/a.ts", inside: true });
    expect(locate(dir, ".")).toMatchObject({ relative: "", inside: true });
    expect(locate(dir, "features/../.git/config")).toMatchObject({ relative: ".git/config", inside: true });
    expect(locate(dir, "src/state.json")).toMatchObject({ relative: "progress.json", inside: true });
    expect(locate(dir, "src/outside/new.txt").inside).toBe(false);
    expect(locate(dir, "../elsewhere.txt").inside).toBe(false);
    expect(locate(dir, "/etc/hostname").inside).toBe(false);
    expect(locate(dir, "src/outside/../x").inside).toBe(false);
  });
});

describe("matchesGlob", () => {
  it("matches a path relative to the worktree against a glob", () => {
    expect(matchesGlob("src/a.ts", "src/**/*.ts")).toBe(true);
    expect(matchesGlob("src/deep/er/a.ts", "src/**/*.ts")).toBe(true);
    expect(matchesGlob("src/a.js", "src/**/*.ts")).toBe(false);
    expect(matchesGlob("lib/src/a.ts", "src/**/*.ts")).toBe(false);
    expect(matchesGlob("tests/unit/a.test.ts", "tests/unit/**")).toBe(true);
    expect(matchesGlob("anything/at/all", "**")).toBe(true);
    expect(matchesGlob("progress.json", "progress.json")).toBe(true);
    expect(matchesGlob("progress.json.bak", "progress.json")).toBe(false);
    expect(matchesGlob("a/tsconfig.build.json", "**/tsconfig*.json")).toBe(true);
    expect(matchesGlob("tsconfig.json", "**/tsconfig*.json")).toBe(true);
    expect(matchesGlob("a/b.ts", "a/?.ts")).toBe(true);
    expect(matchesGlob("a/b/c.ts", "a/*.ts")).toBe(false);
    expect(matchesGlob("a+b.ts", "a+b.ts")).toBe(true);
  });
});
