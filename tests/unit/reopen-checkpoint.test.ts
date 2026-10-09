import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { baseContent, changedSinceCheckpoint, recordCheckpoint, recordHeadCheckpoint } from "../../src/artifacts/checkpoint.js";
import { requireDoneEvidence } from "../../src/artifacts/scenario-evidence.js";
import { commitAll, git } from "./git-fixture.js";
import { FEATURE, RED } from "./red-fixture.js";
import { run, startProject } from "./evidence-fixture.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

const REOPENED = { step: "quality_gate", feature: FEATURE, verify: { kind: "reopen", target: FEATURE }, external: false, date: new Date("2026-10-06T12:00:00Z") };
const DONE = { current_focus: null, features: [{ id: FEATURE, title: "Alpha", status: "done", scenarios: [{ name: "Alpha works", bdd: "pass" }] }] };

function checkpointText(): string {
  return readFileSync(join(dir, `.outside-in/checkpoints/${FEATURE}.json`), "utf8");
}

describe("recordHeadCheckpoint", () => {
  it("takes what later commits changed as the base, and keeps what is not committed as a change", () => {
    write("src/a.ts", "export const a = 1;\n");
    write("src/b.ts", "export const b = 1;\n");
    commitAll();
    write("src/a.ts", "export const a = 2;\n");
    recordCheckpoint(dir, { ...RED, step: "tdd_green" });
    write("src/a.ts", "export const a = 3;\n");
    git("commit", "--quiet", "--all", "--message", "later");
    write("src/b.ts", "export const b = 2;\n");
    expect(recordHeadCheckpoint(dir, REOPENED)).toBe(true);
    expect({ changed: changedSinceCheckpoint(dir, FEATURE), base: baseContent(dir, "src/a.ts", FEATURE) }).toEqual({ changed: ["src/b.ts"], base: "export const a = 3;\n" });
  });

  it("does nothing without a commit, so the existing checkpoint stays", () => {
    write("src/a.ts", "export const a = 1;\n");
    expect(recordHeadCheckpoint(dir, REOPENED)).toBe(false);
    expect(existsSync(join(dir, `.outside-in/checkpoints/${FEATURE}.json`))).toBe(false);
  });

  it("is not a green: closing the feature needs one even when nothing changed", () => {
    write("src/a.ts", "export const a = 1;\n");
    commitAll();
    recordHeadCheckpoint(dir, REOPENED);
    expect(() => requireDoneEvidence(dir, FEATURE, ["Alpha works"])).toThrow("no current green ran");
  });
});

describe("oid progress reopen", () => {
  it("records the checkpoint of the feature from HEAD at quality_gate and forgets its Red base", async () => {
    startProject(DONE);
    recordCheckpoint(dir, RED);
    await run(["progress", "reopen", FEATURE]);
    const recorded = JSON.parse(checkpointText());
    expect({ step: recorded.step, kind: recorded.verify.kind, snapshot: recorded.snapshot, redBase: existsSync(join(dir, `.outside-in/checkpoints/${FEATURE}.red.json`)) }).toEqual({ step: "quality_gate", kind: "reopen", snapshot: {}, redBase: false });
  });
});
