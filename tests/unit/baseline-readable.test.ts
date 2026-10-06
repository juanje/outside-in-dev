import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findingRecord, writeBaseline } from "../../src/artifacts/baseline.js";

describe("the baseline file as a person reads it", () => {
  it("is a 2-space indented list of the records of the findings, with no escaped text", () => {
    const magic = (detail: string) => ({ category: "magic_value" as const, file: "src/a.ts", range: { start: 1, end: 1 }, detail });
    const drafts = [magic("magic number 42"), magic("magic number 77")];
    const dir = mkdtempSync(join(tmpdir(), "oid-unit-"));
    try {
      writeBaseline(dir, drafts);
      const text = readFileSync(join(dir, ".outside-in/baseline.json"), "utf8");
      expect(JSON.parse(text)).toStrictEqual(drafts.map(findingRecord));
      expect(text).toBe(`${JSON.stringify(drafts.map(findingRecord), null, 2)}\n`);
      expect(text).not.toContain("\\");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
