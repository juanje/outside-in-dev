import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readBaseline } from "../../src/artifacts/baseline.js";
import { ProgressError } from "../../src/artifacts/progress.js";

/** `readBaseline` of a project whose baseline file holds `text`. */
function readBaselineOf(text: string) {
  const dir = mkdtempSync(join(tmpdir(), "oid-unit-"));
  try {
    mkdirSync(join(dir, ".outside-in"));
    writeFileSync(join(dir, ".outside-in/baseline.json"), text);
    return readBaseline(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const REFUSAL = /\.outside-in\/baseline\.json.*oid metrics --baseline/;

describe("readBaseline of a file it cannot read", () => {
  it("names the file and says to record it again when the text is not JSON", () => {
    expect(() => readBaselineOf("this is not { json")).toThrow(ProgressError);
    expect(() => readBaselineOf("this is not { json")).toThrow(REFUSAL);
  });

  it("does the same when the JSON is not a list of records: another shape, the old list of escaped text, a record with a missing, unknown or mistyped field", () => {
    const record = { category: "magic_value", file: "src/a.ts", detail: "magic number 42" };
    const refused = [
      { findings: [] },
      ['["magic_value","src/a.ts",null,"magic number 42"]'],
      [null],
      [{ ...record, category: "other" }],
      [{ category: "magic_value", file: "src/a.ts" }],
      [{ ...record, file: 7 }],
      [{ ...record, range: { start: 1, end: 1 } }],
      [{ category: "duplication", file: "src/a.ts", detail: "9 duplicated lines" }],
    ];
    for (const document of refused) expect(() => readBaselineOf(JSON.stringify(document))).toThrow(REFUSAL);
    expect(readBaselineOf(JSON.stringify([record, { category: "duplication", files: ["src/a.ts", "src/b.ts"], detail: "9 duplicated lines" }]))?.size).toBe(2);
  });
});
