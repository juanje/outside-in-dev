import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { changedSinceCheckpoint, recordCheckpoint } from "../../src/artifacts/checkpoint.js";
import { commitAll } from "./git-fixture.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

const RED = { step: "tdd_red", verify: { kind: "red", target: "tests/a.test.ts > adds" }, external: false, date: new Date("2026-10-06T12:00:00Z") };

describe("a checkpoint per feature", () => {
  it("keeps the checkpoint of each feature: recording one does not replace another's", () => {
    write("src/a.ts", "export const a = 1;\n");
    commitAll();
    write("src/a.ts", "export const a = 2;\n");
    recordCheckpoint(dir, { ...RED, feature: "FR-X-01" });
    write("src/a.ts", "export const a = 3;\n");
    recordCheckpoint(dir, { ...RED, feature: "FR-Y-01" });
    expect({ x: changedSinceCheckpoint(dir, "FR-X-01"), y: changedSinceCheckpoint(dir, "FR-Y-01") }).toEqual({ x: ["src/a.ts"], y: [] });
  });

  it("judges a feature with no checkpoint of its own against the single checkpoint when that names it, and against HEAD when it names another", () => {
    write("src/a.ts", "export const a = 1;\n");
    commitAll();
    write("src/a.ts", "export const a = 2;\n");
    recordCheckpoint(dir, { ...RED, feature: null });
    const single = join(dir, ".outside-in", "checkpoint.json");
    writeFileSync(single, JSON.stringify({ ...JSON.parse(readFileSync(single, "utf8")), feature: "FR-X-01" }));
    expect({ named: changedSinceCheckpoint(dir, "FR-X-01"), other: changedSinceCheckpoint(dir, "FR-Y-01") }).toEqual({ named: [], other: ["src/a.ts"] });
  });
});
