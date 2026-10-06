import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../../src/run-cli.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "oid-check-json-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function runCheck(...args: string[]) {
  let stdout = "";
  let stderr = "";
  const exitCode = runCli(["check", ...args], {
    cwd: dir,
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
  });
  return { exitCode, stdout, stderr };
}

const SPEC = "### FR-X-01: Alpha\n\nDoes alpha.\n";

describe("oid check --json with inputs that are missing or broken", () => {
  it("reports a missing SPEC.md as a spec violation in one JSON document", () => {
    expect(runCheck("--json")).toEqual({
      exitCode: 1,
      stdout: `${JSON.stringify({ ok: false, violations: [{ check: "spec", message: "SPEC.md not found" }] })}\n`,
      stderr: "",
    });
  });

  it("reports a feature file with a Gherkin syntax error as a traceability violation naming the file", () => {
    writeFileSync(join(dir, "SPEC.md"), SPEC);
    mkdirSync(join(dir, "features"));
    writeFileSync(join(dir, "features", "broken.feature"), "Feature x\n");
    const { exitCode, stdout, stderr } = runCheck("--json");
    const report = JSON.parse(stdout) as { ok: boolean; violations: { check: string; message: string }[] };
    expect({ exitCode, stderr, ok: report.ok, checks: report.violations.map((v) => v.check) }).toEqual({
      exitCode: 1,
      stderr: "",
      ok: false,
      checks: ["traceability"],
    });
    expect(report.violations[0]!.message).toMatch(/^features\/broken\.feature: /);
  });

  it.each([
    ["does not follow the schema", JSON.stringify({ current_focus: null, features: [{ id: "FR-X-01", title: "Alpha", status: "pending", notes: "x" }] }), "features[0].notes"],
    ["is not valid JSON", "{ not json", "progress.json is not valid JSON"],
  ])("reports a progress file that %s as a progress violation", (_label, content, expected) => {
    writeFileSync(join(dir, "SPEC.md"), SPEC);
    writeFileSync(join(dir, "progress.json"), content);
    const { exitCode, stdout, stderr } = runCheck("--json");
    const report = JSON.parse(stdout) as { ok: boolean; violations: { check: string; message: string }[] };
    expect({ exitCode, stderr, ok: report.ok, checks: report.violations.map((v) => v.check) }).toEqual({
      exitCode: 1,
      stderr: "",
      ok: false,
      checks: ["progress"],
    });
    expect(report.violations[0]!.message).toContain(expected);
    expect(report.violations[0]!.message).toContain("progress.json");
  });
});
