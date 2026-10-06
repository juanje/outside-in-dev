import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../../src/run-cli.js";
import { findingLines, summaryCount } from "./metrics-output.js";

let dir: string;

/** Runs git in the temporary project, never in the repository under test. */
function git(...args: string[]): void {
  const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...env } = process.env;
  const run = spawnSync("git", args, { cwd: dir, env, encoding: "utf8" });
  if (run.status !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr}`);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "oid-unit-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("oid metrics --changed", () => {
  it("prints only the findings on lines changed since HEAD and counts them", () => {
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
    writeFileSync(join(dir, "src/steady.ts"), "export const isSteady = (n: number) => n > 5;\n");
    writeFileSync(join(dir, "src/moving.ts"), "export const isMoving = (n: number) => n > 7;\n");
    git("init", "--quiet");
    git("config", "user.name", "Fixture");
    git("config", "user.email", "fixture@example.com");
    git("add", "-A");
    git("commit", "--quiet", "--message", "fixture");
    writeFileSync(join(dir, "src/moving.ts"), "export const isMoving = (n: number) => n > 8;\n");
    let stdout = "";
    runCli(["metrics", "--changed"], { cwd: dir, stdout: (text) => (stdout += text), stderr: () => undefined });
    expect(findingLines(stdout, "magic_value")).toEqual(["magic_value src/moving.ts:1-1 magic number 8"]);
    expect(summaryCount(stdout, "magic_value")).toBe(1);
  });
});
