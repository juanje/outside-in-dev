import { describe, expect, it } from "vitest";
import { runCli } from "../../src/run-cli.js";

describe("oid metrics --help", () => {
  it("describes the option that records the baseline and shows it in the usage", async () => {
    let stdout = "";
    const exitCode = await runCli(["metrics", "--help"], { cwd: ".", stdout: (text) => (stdout += text), stderr: () => undefined });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("oid metrics --baseline");
    expect(stdout).toMatch(/^ {2}--baseline {2,}\S.*baseline.*$/m);
  });
});
