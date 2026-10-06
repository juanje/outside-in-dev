import { describe, expect, it } from "vitest";
import { runCli } from "../../src/run-cli.js";

describe("oid metrics --help", () => {
  it("describes the option that limits the findings to the changed lines", () => {
    let stdout = "";
    const exitCode = runCli(["metrics", "--help"], { cwd: ".", stdout: (text) => (stdout += text), stderr: () => undefined });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("usage: oid metrics [--changed]");
    expect(stdout).toMatch(/^ {2}--changed {2,}\S.*changed.*$/m);
  });
});
