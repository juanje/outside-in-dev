import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  const exitCode = runCli(args, { cwd: dir, stdout: (text) => (stdout += text), stderr: () => undefined });
  return { exitCode, stdout };
}

describe("oid check without SPEC.md", () => {
  it("reports a spec violation and exits 1", () => {
    expect(run(["check"])).toEqual({ exitCode: 1, stdout: "SPEC.md not found\n" });
  });
});

describe("oid check with a feature file that has a Gherkin syntax error", () => {
  it("prints one line naming the file, without an empty scenario name", () => {
    writeFileSync(join(dir, "SPEC.md"), "### FR-X-01: Alpha\n\nThe tool does alpha.\n");
    mkdirSync(join(dir, "features"));
    writeFileSync(join(dir, "features", "broken.feature"), "Feature x\n");
    const { exitCode, stdout } = run(["check"]);
    expect(exitCode).toBe(1);
    expect(stdout).toMatch(/^features\/broken\.feature: Gherkin syntax error: .+\n$/);
  });
});
