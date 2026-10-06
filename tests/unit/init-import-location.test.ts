import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../../src/run-cli.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "oid-init-location-"));
  writeFileSync(join(dir, "tsconfig.json"), "{}");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function put(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

function runImport(...extra: string[]) {
  let stdout = "";
  let stderr = "";
  const exitCode = runCli(["init", "--import-progress", ...extra], {
    cwd: dir,
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
  });
  return { exitCode, stdout, stderr };
}

const SPEC = "### FR-DEMO-01: Old thing\n\nDescription.\n";
const OLD_PROGRESS = JSON.stringify({
  current_focus: null,
  features: [{ id: "FR-DEMO-01", title: "Old thing", status: "blocked" }],
});

function featureIds(path: string): string[] {
  return (JSON.parse(readFileSync(join(dir, path), "utf8")) as { features: { id: string }[] }).features.map((f) => f.id);
}

describe("oid init --import-progress: where the progress file is", () => {
  it("finds specs/progress.json when there is none at the root and converts it in place", () => {
    put("specs/SPEC.md", SPEC);
    put("specs/progress.json", OLD_PROGRESS);
    const { exitCode, stdout } = runImport();
    expect(exitCode).toBe(0);
    expect(stdout).toContain("FR-DEMO-01: status blocked converted to pending");
    expect(featureIds("specs/progress.json")).toEqual(["FR-DEMO-01"]);
    expect(existsSync(join(dir, "progress.json"))).toBe(false);
  });

  it("moves a root progress.json beside a specification in specs/ and says so", () => {
    put("specs/SPEC.md", SPEC);
    put("progress.json", OLD_PROGRESS);
    const { exitCode, stdout } = runImport();
    expect(exitCode).toBe(0);
    expect(stdout).toContain("progress read from progress.json and written to specs/progress.json; progress.json was removed");
    expect(featureIds("specs/progress.json")).toEqual(["FR-DEMO-01"]);
    expect(existsSync(join(dir, "progress.json"))).toBe(false);
  });

  it("moves a progress file that is already current without changing its content", () => {
    const current = `${JSON.stringify({ current_focus: null, features: [{ id: "FR-DEMO-01", title: "Old thing", status: "pending" }] })}\n`;
    put("specs/SPEC.md", SPEC);
    put("progress.json", current);
    const { exitCode, stdout } = runImport();
    expect(exitCode).toBe(0);
    expect(stdout).toContain("already in the current schema");
    expect(stdout).toContain("written to specs/progress.json; progress.json was removed");
    expect(readFileSync(join(dir, "specs/progress.json"), "utf8")).toBe(current);
    expect(existsSync(join(dir, "progress.json"))).toBe(false);
  });

  it("refuses when the destination exists and is not the source, and writes and removes nothing", () => {
    const existing = '{ "current_focus": null, "features": [] }\n';
    put("specs/SPEC.md", SPEC);
    put("progress.json", OLD_PROGRESS);
    put("specs/progress.json", existing);
    const { exitCode, stderr } = runImport();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("specs/progress.json already exists");
    expect(readFileSync(join(dir, "progress.json"), "utf8")).toBe(OLD_PROGRESS);
    expect(readFileSync(join(dir, "specs/progress.json"), "utf8")).toBe(existing);
    expect(existsSync(join(dir, ".outside-in.json"))).toBe(false);
    expect(existsSync(join(dir, ".gitignore"))).toBe(false);
  });

  it("names the places looked at when there is no progress file", () => {
    const { exitCode, stderr } = runImport();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("progress.json not found");
    expect(stderr).toContain("progress.json, specs/progress.json");
  });

  it("reads the file given as an argument and moves it beside the specification", () => {
    put("old/progress.json", OLD_PROGRESS);
    const { exitCode, stdout } = runImport("old/progress.json");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("progress read from old/progress.json and written to progress.json; old/progress.json was removed");
    expect(featureIds("progress.json")).toEqual(["FR-DEMO-01"]);
    expect(existsSync(join(dir, "old/progress.json"))).toBe(false);
  });
});
