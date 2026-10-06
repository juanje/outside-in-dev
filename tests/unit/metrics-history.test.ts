import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendSnapshot, readLastSnapshot } from "../../src/artifacts/metrics-history.js";
import type { Snapshot } from "../../src/artifacts/snapshot.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

const snapshot = (date: string, complexity: number): Snapshot => ({
  date,
  counts: { complexity, dead_code: 0, doc_drift: 0, duplication: 0, magic_value: 0 },
  duplication: { source: 0, tests: 0 },
});

describe("appendSnapshot", () => {
  it("creates .outside-in/metrics.jsonl when missing and adds one JSON line per snapshot after the existing ones", () => {
    appendSnapshot(dir, snapshot("2026-10-06T12:00:00.000Z", 1));
    appendSnapshot(dir, snapshot("2026-10-07T12:00:00.000Z", 2));
    const lines = readFileSync(join(dir, ".outside-in/metrics.jsonl"), "utf8").split("\n");
    expect(lines.pop()).toBe("");
    expect(lines.map((line) => JSON.parse(line))).toEqual([snapshot("2026-10-06T12:00:00.000Z", 1), snapshot("2026-10-07T12:00:00.000Z", 2)]);
  });
});

describe("readLastSnapshot", () => {
  it("gives the snapshot that was added last, and nothing when the project has no history yet", () => {
    expect(readLastSnapshot(dir)).toBeUndefined();
    appendSnapshot(dir, snapshot("2026-10-06T12:00:00.000Z", 1));
    appendSnapshot(dir, snapshot("2026-10-07T12:00:00.000Z", 2));
    expect(readLastSnapshot(dir)).toEqual(snapshot("2026-10-07T12:00:00.000Z", 2));
  });
});
