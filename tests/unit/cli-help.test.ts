import { describe, expect, it } from "vitest";
import { runCli } from "../../src/run-cli.js";

function run(args: string[]) {
  let stdout = "";
  let stderr = "";
  const exitCode = runCli(args, {
    cwd: "/nonexistent-oid-test-dir",
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
  });
  return { exitCode, stdout, stderr };
}

describe("oid --help", () => {
  it("says what oid does and describes every command, exiting 0 with nothing on stderr", () => {
    const { exitCode, stdout, stderr } = run(["--help"]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("Outside-In");
    for (const command of ["progress", "check", "init"]) {
      expect(stdout).toMatch(new RegExp(`^\\s*${command}\\s{2,}\\S`, "m"));
    }
  });
});

describe("oid check --help", () => {
  it("shows what check does, its usage and its --json option", () => {
    const { exitCode, stdout, stderr } = run(["check", "--help"]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("usage: oid check [--json]");
    expect(stdout).toMatch(/^\s*--json\s{2,}\S/m);
  });
});

describe("oid init --help", () => {
  it("shows its usage and its --import-progress option", () => {
    const { exitCode, stdout, stderr } = run(["init", "--help"]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("usage: oid init [--import-progress [path]]");
    expect(stdout).toMatch(/^\s*--import-progress\s{2,}\S/m);
  });
});

describe("oid metrics --help", () => {
  it("shows what metrics does and its usage", () => {
    const { exitCode, stdout, stderr } = run(["metrics", "--help"]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("Report the code-health findings of the project");
    expect(stdout).toContain("usage: oid metrics");
  });
});

describe("oid progress --help", () => {
  it("describes every subcommand and shows its usage", () => {
    const { exitCode, stdout, stderr } = run(["progress", "--help"]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("usage: oid progress <subcommand>");
    for (const subcommand of ["current", "status", "show", "add", "focus", "step", "scenario", "done"]) {
      expect(stdout).toMatch(new RegExp(`^\\s*${subcommand}\\s{2,}\\S`, "m"));
    }
    expect(stdout).toContain("oid progress show FR-xxx");
    expect(stdout).toContain('oid progress add FR-xxx "<title>"');
    expect(stdout).toContain("oid progress step FR-xxx <cycle_step>");
    expect(stdout).toContain('oid progress scenario <pass|fail|pending> FR-xxx "<scenario name>"');
  });
});

describe("oid progress step --help", () => {
  it("shows what step does, its usage and the allowed cycle steps", () => {
    const { exitCode, stdout, stderr } = run(["progress", "step", "--help"]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("Move a feature to its next cycle step");
    expect(stdout).toContain("usage: oid progress step FR-xxx <cycle_step>");
    for (const step of ["select", "bdd_red", "tdd_red", "tdd_green", "refactor", "quality_gate"]) {
      expect(stdout).toContain(step);
    }
  });
});

describe("oid progress scenario --help", () => {
  it("shows its usage and the allowed statuses", () => {
    const { exitCode, stdout, stderr } = run(["progress", "scenario", "--help"]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain('usage: oid progress scenario <pass|fail|pending> FR-xxx "<scenario name>"');
    expect(stdout).toContain("Statuses: pass, fail, pending");
  });
});

describe("oid --help usage", () => {
  it("shows the usage line and how to get help for one command", () => {
    const { stdout } = run(["--help"]);
    expect(stdout).toContain("usage: oid <command> [<subcommand>] [arguments]");
    expect(stdout).toContain("oid <command> --help");
  });
});
