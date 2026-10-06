import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findingKey, readBaseline, writeBaseline } from "../../src/artifacts/baseline.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

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
