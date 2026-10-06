import { describe, expect, it } from "vitest";
import { runCli } from "../../src/run-cli.js";

async function run(args: string[]) {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(args, {
    cwd: "/nonexistent-oid-test-dir",
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
  });
  return { exitCode, stdout, stderr };
}

describe("top-level dispatch", () => {
  it("rejects an unknown command, naming it and listing the valid commands", async () => {
    const { exitCode, stdout, stderr } = await run(["bogus"]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("bogus");
    expect(stderr).toContain("progress");
    expect(stderr).toContain("check");
  });

  it("reports a missing command without printing undefined", async () => {
    const { exitCode, stdout, stderr } = await run([]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("missing command");
    expect(stderr).toContain("progress, check");
    expect(stderr).not.toContain("undefined");
  });
});

describe("progress subcommand dispatch", () => {
  it("rejects an unknown subcommand, naming it and listing the valid ones", async () => {
    const { exitCode, stdout, stderr } = await run(["progress", "bogus"]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("unknown subcommand bogus");
    expect(stderr).toContain("current, status, show, add, focus, step, scenario, done");
  });

  it("reports a missing subcommand without printing undefined", async () => {
    const { exitCode, stdout, stderr } = await run(["progress"]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("missing subcommand");
    expect(stderr).not.toContain("undefined");
  });
});

describe("progress subcommand arguments", () => {
  it("prints the usage of step when the cycle step is missing", async () => {
    const { exitCode, stdout, stderr } = await run(["progress", "step", "FR-X-01"]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("usage: oid progress step FR-xxx <cycle_step>");
  });

  it("prints the usage of scenario when only some of its arguments are given", async () => {
    const { exitCode, stdout, stderr } = await run(["progress", "scenario", "pass", "FR-X-01"]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('usage: oid progress scenario <pass|fail|pending> FR-xxx "<scenario name>"');
  });

  it.each([
    [["show"], "usage: oid progress show FR-xxx"],
    [["focus"], "usage: oid progress focus FR-xxx"],
    [["done"], "usage: oid progress done FR-xxx"],
    [["add"], 'usage: oid progress add FR-xxx "<title>"'],
    [["add", "FR-X-01"], 'usage: oid progress add FR-xxx "<title>"'],
  ])("prints the usage for oid progress %j", async (args, usage) => {
    const { exitCode, stdout, stderr } = await run(["progress", ...args]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain(usage);
  });
});
