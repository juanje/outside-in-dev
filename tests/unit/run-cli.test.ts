import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../../src/run-cli.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "oid-unit-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function run(args: string[]) {
  let stdout = "";
  let stderr = "";
  const exitCode = runCli(args, {
    cwd: dir,
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
  });
  return { exitCode, stdout, stderr };
}

function writeProgress(progress: unknown) {
  writeFileSync(join(dir, "progress.json"), JSON.stringify(progress, null, 2) + "\n");
}

const SAMPLE = {
  current_focus: "FR-X-02",
  features: [
    { id: "FR-X-01", title: "Alpha", status: "pending" },
    {
      id: "FR-X-02",
      title: "Beta",
      status: "in_progress",
      cycle_step: "tdd_red",
      scenarios: [
        { name: "Beta works", bdd: "fail" },
        { name: "Beta also works", bdd: "pending" },
      ],
    },
    { id: "FR-X-03", title: "Gamma", status: "done", scenarios: [{ name: "Gamma works", bdd: "pass" }] },
  ],
};

describe("runCli progress", () => {
  it("fails naming progress.json when the file is missing", () => {
    const result = run(["progress", "status"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("progress.json");
  });

  it("status lists every feature with its status and cycle step", () => {
    writeProgress(SAMPLE);
    const result = run(["progress", "status"]);
    expect(result.exitCode).toBe(0);
    const lines = result.stdout.trimEnd().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/FR-X-01.*Alpha.*pending/);
    expect(lines[1]).toMatch(/FR-X-02.*Beta.*in_progress.*tdd_red/);
    expect(lines[2]).toMatch(/FR-X-03.*Gamma.*done/);
  });

  it("status marks the focused feature", () => {
    writeProgress(SAMPLE);
    const lines = run(["progress", "status"]).stdout.trimEnd().split("\n");
    expect(lines[1]).toContain("(focused)");
    expect(lines[0]).not.toContain("(focused)");
    expect(lines[2]).not.toContain("(focused)");
  });

  it("current prints the focused feature with its step and scenarios", () => {
    writeProgress(SAMPLE);
    const result = run(["progress", "current"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/FR-X-02.*Beta.*in_progress.*tdd_red/);
    expect(result.stdout).toMatch(/Beta works.*fail/);
    expect(result.stdout).toMatch(/Beta also works.*pending/);
    expect(result.stdout).not.toContain("FR-X-01");
  });

  it("current says so when no feature is focused", () => {
    writeProgress({ ...SAMPLE, current_focus: null });
    const result = run(["progress", "current"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No feature is focused");
  });

  it("show prints one feature with its scenarios", () => {
    writeProgress(SAMPLE);
    const result = run(["progress", "show", "FR-X-03"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/FR-X-03.*Gamma.*done/);
    expect(result.stdout).toMatch(/Gamma works.*pass/);
    expect(result.stdout).not.toContain("FR-X-02");
  });

  it("show fails naming a feature that is not tracked", () => {
    writeProgress(SAMPLE);
    const result = run(["progress", "show", "FR-X-99"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("FR-X-99");
  });
});
