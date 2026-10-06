import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findingKey, readBaseline, writeBaseline } from "../../src/artifacts/baseline.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "oid-unit-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("the baseline file", () => {
  it("is missing until a baseline is written, creating .outside-in, and then gives the identity of each finding written", () => {
    const magic = (start: number, detail: string) => ({ category: "magic_value" as const, file: "src/a.ts", range: { start, end: start }, detail });
    const drafts = [magic(1, "magic number 42"), magic(2, "magic number 77")];
    expect(readBaseline(dir)).toBeUndefined();
    writeBaseline(dir, drafts);
    expect(existsSync(join(dir, ".outside-in/baseline.json"))).toBe(true);
    expect(readBaseline(dir)).toEqual(new Set(drafts.map(findingKey)));
  });
});
