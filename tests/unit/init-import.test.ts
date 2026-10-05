import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../../src/run-cli.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "oid-init-import-"));
  writeFileSync(join(dir, "tsconfig.json"), "{}");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function runImport() {
  let stdout = "";
  let stderr = "";
  const exitCode = runCli(["init", "--import-progress"], {
    cwd: dir,
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
  });
  return { exitCode, stdout, stderr };
}

describe("oid init --import-progress", () => {
  it("fails without a progress file and writes nothing", () => {
    const { exitCode, stderr } = runImport();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("progress.json not found");
    expect(existsSync(join(dir, ".outside-in.json"))).toBe(false);
    expect(existsSync(join(dir, ".gitignore"))).toBe(false);
  });

  it("reports the violations of an invalid converted progress and writes nothing", () => {
    const original = JSON.stringify({ current_focus: null, features: [{ id: "FR-1", title: "A", status: "pending" }] });
    writeFileSync(join(dir, "progress.json"), original);
    writeFileSync(join(dir, ".gitignore"), "dist/\n");
    const { exitCode, stderr } = runImport();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("features[0].id");
    expect(existsSync(join(dir, ".outside-in.json"))).toBe(false);
    expect(readFileSync(join(dir, ".gitignore"), "utf8")).toBe("dist/\n");
    expect(readFileSync(join(dir, "progress.json"), "utf8")).toBe(original);
  });

  it("converts the progress file in place, lists what changed and still writes the configuration", () => {
    writeFileSync(
      join(dir, "progress.json"),
      JSON.stringify({
        current_focus: null,
        features: [{ id: "FR-DEMO-01", title: "A", status: "blocked", note: "later" }],
      }),
    );
    const { exitCode, stdout } = runImport();
    expect(exitCode).toBe(0);
    expect(JSON.parse(readFileSync(join(dir, "progress.json"), "utf8"))).toEqual({
      current_focus: null,
      features: [{ id: "FR-DEMO-01", title: "A", status: "pending" }],
    });
    expect(stdout).toContain("FR-DEMO-01: status blocked converted to pending");
    expect(stdout).toContain("FR-DEMO-01: note later dropped");
    expect(existsSync(join(dir, ".outside-in.json"))).toBe(true);
  });

  it("leaves a progress file that is already in the current schema untouched and says so", () => {
    const original = '{"current_focus":null,"features":[{"id":"FR-DEMO-01","title":"A","status":"pending"}]}';
    writeFileSync(join(dir, "progress.json"), original);
    const { exitCode, stdout } = runImport();
    expect(exitCode).toBe(0);
    expect(readFileSync(join(dir, "progress.json"), "utf8")).toBe(original);
    expect(stdout).toContain("progress.json is already in the current schema");
  });
});
