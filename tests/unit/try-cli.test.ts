import { describe, expect, it } from "vitest";
import { REAL_RUNNERS } from "../../src/artifacts/verify-runner.js";
import { runCli } from "../../src/run-cli.js";
import { runWithoutProject } from "./run-capture.js";

describe("oid try --help", () => {
  it("shows its usage with the three forms of target, the dry run option and the exit codes, and oid --help lists the command", async () => {
    const { exitCode, stdout, stderr } = await runWithoutProject(["try", "--help"]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain('usage: oid try "<test file> > <test name>" [--dry-run]');
    expect(stdout).toContain("oid try <feature file>:<line>");
    expect(stdout).toContain('oid try "<scenario name>"');
    expect(stdout).toMatch(/^\s*--dry-run\s{2,}\S/m);
    expect(stdout).toContain("Exit codes");
    expect((await runWithoutProject(["--help"])).stdout).toMatch(/^\s*try\s{2,}\S/m);
  });
});

describe("oid try", () => {
  it("runs through the runners it is given and reports a usage error as the other commands do", async () => {
    let stderr = "";
    const exitCode = await runCli(["try"], { cwd: "/nonexistent-oid-test-dir", stdout: () => undefined, stderr: (text) => (stderr += text) }, { runners: REAL_RUNNERS });
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/^error: missing test or scenario/);
  });
});
