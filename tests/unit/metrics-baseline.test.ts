import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readBaseline } from "../../src/artifacts/baseline.js";
import { runCli } from "../../src/run-cli.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "oid-unit-"));
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
  writeFileSync(join(dir, "src/limits.ts"), "export const isLong = (n: number) => n > 42;\nexport const isHuge = (n: number) => n > 77;\n");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("oid metrics --baseline", () => {
  it("records the current findings in the baseline and says how many", async () => {
    let stdout = "";
    const exitCode = await runCli(["metrics", "--baseline"], { cwd: dir, stdout: (text) => (stdout += text), stderr: () => undefined });
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/^baseline: 2 findings recorded in \.outside-in\/baseline\.json$/m);
    expect(readBaseline(dir)?.size).toBe(2);
  });

  it("is a usage error together with --changed, and records no baseline", async () => {
    let stderr = "";
    const exitCode = await runCli(["metrics", "--changed", "--baseline"], { cwd: dir, stdout: () => undefined, stderr: (text) => (stderr += text) });
    expect(exitCode).toBe(1);
    expect(stderr).toContain("--changed and --baseline cannot be used together");
    expect(readBaseline(dir)).toBeUndefined();
  });

  it("says finding, not findings, for a baseline of one", async () => {
    writeFileSync(join(dir, "src/limits.ts"), "export const isLong = (n: number) => n > 42;\n");
    let stdout = "";
    await runCli(["metrics", "--baseline"], { cwd: dir, stdout: (text) => (stdout += text), stderr: () => undefined });
    expect(stdout).toMatch(/^baseline: 1 finding recorded in /m);
  });
});
