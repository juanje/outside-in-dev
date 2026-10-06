import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../../src/run-cli.js";
import { findingLines } from "./metrics-output.js";

let dir: string;

/** Runs git in the temporary project, never in the repository under test. */
function git(...args: string[]): void {
  const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...env } = process.env;
  const run = spawnSync("git", args, { cwd: dir, env, encoding: "utf8" });
  if (run.status !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr}`);
}

/** Runs `oid metrics` with `args` in the temporary project. */
function metrics(...args: string[]): { exitCode: number; stdout: string; stderr: string } {
  let stdout = "";
  let stderr = "";
  const exitCode = runCli(["metrics", ...args], { cwd: dir, stdout: (text) => (stdout += text), stderr: (text) => (stderr += text) });
  return { exitCode, stdout, stderr };
}

/** A committed project with one magic number. */
function committedProject(): void {
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
  writeFileSync(join(dir, "src/limits.ts"), "export const isLong = (n: number) => n > 42;\n");
  git("init", "--quiet");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.com");
  git("add", "-A");
  git("commit", "--quiet", "--message", "fixture");
}

/** A committed project with one magic number, whose finding is recorded as the baseline. */
function baselinedProject(): void {
  committedProject();
  metrics("--baseline");
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "oid-unit-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("oid metrics --changed with a baseline", () => {
  it("leaves out the findings of the baseline, and says how many", () => {
    baselinedProject();
    writeFileSync(join(dir, "src/limits.ts"), "export const isLong = (n: number): boolean => n > 42;\nexport const isHuge = (n: number) => n > 77;\n");
    const { stdout } = metrics("--changed");
    expect(findingLines(stdout, "magic_value")).toEqual(["magic_value src/limits.ts:2-2 magic number 77"]);
    expect(stdout).toMatch(/^1 existing finding left out$/m);
  });

  it("fails when a finding that is not in the baseline remains, and succeeds when only findings of the baseline are left", () => {
    baselinedProject();
    writeFileSync(join(dir, "src/limits.ts"), "export const isLong = (n: number): boolean => n > 42;\n");
    expect(metrics("--changed").exitCode).toBe(0);
    writeFileSync(join(dir, "src/limits.ts"), "export const isLong = (n: number): boolean => n > 42;\nexport const isHuge = (n: number) => n > 77;\n");
    expect(metrics("--changed").exitCode).toBe(1);
  });

  it("says once on the error output that there is no baseline, and treats every finding as new", () => {
    committedProject();
    writeFileSync(join(dir, "src/limits.ts"), "export const isLong = (n: number): boolean => n > 42;\n");
    const { stdout, stderr } = metrics("--changed");
    expect(findingLines(stdout, "magic_value")).toEqual(["magic_value src/limits.ts:1-1 magic number 42"]);
    expect(stderr.match(/no baseline.*oid metrics --baseline/g)).toHaveLength(1);
  });
});
