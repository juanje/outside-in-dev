import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProgressError } from "../../src/artifacts/progress.js";
import { readChangedLines } from "../../src/artifacts/git-changes.js";

let dir: string;

/** Runs git in the temporary project, never in the repository under test. */
function git(...args: string[]): void {
  const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...env } = process.env;
  const run = spawnSync("git", args, { cwd: dir, env, encoding: "utf8" });
  if (run.status !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr}`);
}

function commitAll(): void {
  git("init", "--quiet");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.com");
  git("add", "-A");
  git("commit", "--quiet", "--message", "fixture");
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "oid-unit-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("readChangedLines", () => {
  it("reads the lines changed in the working tree since HEAD, staged or not", () => {
    writeFileSync(join(dir, "a.ts"), "one\ntwo\nthree\n");
    writeFileSync(join(dir, "b.ts"), "one\ntwo\nthree\n");
    commitAll();
    writeFileSync(join(dir, "a.ts"), "one\nTWO\nthree\n");
    git("add", "a.ts");
    writeFileSync(join(dir, "b.ts"), "one\ntwo\nTHREE\n");
    expect(readChangedLines(dir)).toEqual(
      new Map([
        ["a.ts", [{ start: 2, end: 2 }]],
        ["b.ts", [{ start: 3, end: 3 }]],
      ]),
    );
  });

  it("counts a file that git does not track as changed from its first line to its last, but not an ignored one", () => {
    writeFileSync(join(dir, ".gitignore"), "ignored.ts\n");
    writeFileSync(join(dir, "a.ts"), "one\n");
    commitAll();
    writeFileSync(join(dir, "fresh.ts"), "one\ntwo\nthree\n");
    writeFileSync(join(dir, "ignored.ts"), "one\ntwo\n");
    expect(readChangedLines(dir)).toEqual(new Map([["fresh.ts", [{ start: 1, end: 3 }]]]));
  });

  it("refuses a directory that is not a git repository", () => {
    writeFileSync(join(dir, "a.ts"), "one\n");
    expect(() => readChangedLines(dir)).toThrow(new ProgressError("--changed needs a git repository, and this directory is not a git repository"));
  });

  it("refuses a git repository that has no commits yet", () => {
    git("init", "--quiet");
    writeFileSync(join(dir, "a.ts"), "one\n");
    expect(() => readChangedLines(dir)).toThrow(new ProgressError("--changed compares with HEAD, and this git repository has no commits yet"));
  });

  it("names the files by their path from a project directory inside the repository, and leaves out the changes outside it", () => {
    mkdirSync(join(dir, "app"));
    writeFileSync(join(dir, "app/a.ts"), "one\ntwo\n");
    writeFileSync(join(dir, "other.ts"), "one\n");
    commitAll();
    writeFileSync(join(dir, "app/a.ts"), "one\nTWO\n");
    writeFileSync(join(dir, "other.ts"), "ONE\n");
    expect(readChangedLines(join(dir, "app"))).toEqual(new Map([["a.ts", [{ start: 2, end: 2 }]]]));
  });
});
