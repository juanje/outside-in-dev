import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { dir, useTempDir, write } from "./temp-project.js";
import { runOid } from "./run-capture.js";

useTempDir();

beforeEach(() => {
  writeFileSync(join(dir, "tsconfig.json"), "{}");
});

const runImport = (...extra: string[]) => runOid(["init", "--import-progress", ...extra], dir);

const SPEC = "### FR-DEMO-01: Old thing\n\nDescription.\n";
const OLD_PROGRESS = JSON.stringify({
  current_focus: null,
  features: [{ id: "FR-DEMO-01", title: "Old thing", status: "blocked" }],
});

function featureIds(path: string): string[] {
  return (JSON.parse(readFileSync(join(dir, path), "utf8")) as { features: { id: string }[] }).features.map((f) => f.id);
}

describe("oid init --import-progress: where the progress file is", () => {
  it("finds specs/progress.json when there is none at the root and converts it in place", async () => {
    write("specs/SPEC.md", SPEC);
    write("specs/progress.json", OLD_PROGRESS);
    const { exitCode, stdout } = await runImport();
    expect(exitCode).toBe(0);
    expect(stdout).toContain("FR-DEMO-01: status blocked converted to pending");
    expect(featureIds("specs/progress.json")).toEqual(["FR-DEMO-01"]);
    expect(existsSync(join(dir, "progress.json"))).toBe(false);
  });

  it("moves a root progress.json beside a specification in specs/ and says so", async () => {
    write("specs/SPEC.md", SPEC);
    write("progress.json", OLD_PROGRESS);
    const { exitCode, stdout } = await runImport();
    expect(exitCode).toBe(0);
    expect(stdout).toContain("progress read from progress.json and written to specs/progress.json; progress.json was removed");
    expect(featureIds("specs/progress.json")).toEqual(["FR-DEMO-01"]);
    expect(existsSync(join(dir, "progress.json"))).toBe(false);
  });

  it("moves a progress file that is already current without changing its content", async () => {
    const current = `${JSON.stringify({ current_focus: null, features: [{ id: "FR-DEMO-01", title: "Old thing", status: "pending" }] })}\n`;
    write("specs/SPEC.md", SPEC);
    write("progress.json", current);
    const { exitCode, stdout } = await runImport();
    expect(exitCode).toBe(0);
    expect(stdout).toContain("already in the current schema");
    expect(stdout).toContain("written to specs/progress.json; progress.json was removed");
    expect(readFileSync(join(dir, "specs/progress.json"), "utf8")).toBe(current);
    expect(existsSync(join(dir, "progress.json"))).toBe(false);
  });

  it("refuses when the destination exists and is not the source, and writes and removes nothing", async () => {
    const existing = '{ "current_focus": null, "features": [] }\n';
    write("specs/SPEC.md", SPEC);
    write("progress.json", OLD_PROGRESS);
    write("specs/progress.json", existing);
    const { exitCode, stderr } = await runImport();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("specs/progress.json already exists");
    expect(readFileSync(join(dir, "progress.json"), "utf8")).toBe(OLD_PROGRESS);
    expect(readFileSync(join(dir, "specs/progress.json"), "utf8")).toBe(existing);
    expect(existsSync(join(dir, ".outside-in.json"))).toBe(false);
    expect(existsSync(join(dir, ".gitignore"))).toBe(false);
  });

  it("names the places looked at when there is no progress file", async () => {
    const { exitCode, stderr } = await runImport();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("progress.json not found");
    expect(stderr).toContain("progress.json, specs/progress.json");
  });

  it("reads the file given as an argument and moves it beside the specification", async () => {
    write("old/progress.json", OLD_PROGRESS);
    const { exitCode, stdout } = await runImport("old/progress.json");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("progress read from old/progress.json and written to progress.json; old/progress.json was removed");
    expect(featureIds("progress.json")).toEqual(["FR-DEMO-01"]);
    expect(existsSync(join(dir, "old/progress.json"))).toBe(false);
  });

  it("fails when the file given as an argument does not exist, naming it and writing nothing", async () => {
    write("progress.json", OLD_PROGRESS);
    const { exitCode, stdout, stderr } = await runImport("old/progress.json");
    expect({ exitCode, stdout, stderr }).toEqual({ exitCode: 1, stdout: "", stderr: "error: old/progress.json not found\n" });
    expect(readFileSync(join(dir, "progress.json"), "utf8")).toBe(OLD_PROGRESS);
    expect(existsSync(join(dir, ".outside-in.json"))).toBe(false);
    expect(existsSync(join(dir, ".gitignore"))).toBe(false);
  });
});
