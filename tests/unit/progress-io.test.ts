import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadProgress, ProgressError, saveProgress, type Progress } from "../../src/artifacts/progress.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "oid-unit-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadProgress", () => {
  it("rejects a file that violates the schema and names the violation", () => {
    const invalid = { current_focus: null, features: [{ id: "FR-X-01", title: "Alpha", status: "pending", notes: "x" }] };
    writeFileSync(join(dir, "progress.json"), JSON.stringify(invalid));
    expect(() => loadProgress(dir)).toThrow(ProgressError);
    expect(() => loadProgress(dir)).toThrow(/features\[0\]\.notes: unknown field/);
  });
});

describe("loadProgress with a progress file path", () => {
  it("reads that file and names it in a violation", () => {
    mkdirSync(join(dir, "specs"));
    const invalid = { current_focus: null, features: [{ id: "FR-X-01", title: "", status: "pending" }] };
    writeFileSync(join(dir, "specs", "progress.json"), JSON.stringify(invalid));
    expect(() => loadProgress(dir, "specs/progress.json")).toThrow(/^specs\/progress\.json is invalid:\n.*features\[0\]\.title/);
  });
});

describe("saveProgress", () => {
  it("refuses to write a document that violates the schema", () => {
    const invalid = { current_focus: null, features: [{ id: "FR-X-01", title: "", status: "pending" }] };
    expect(() => saveProgress(dir, invalid as Progress)).toThrow(/features\[0\]\.title: must not be empty/);
    expect(existsSync(join(dir, "progress.json"))).toBe(false);
  });
});
