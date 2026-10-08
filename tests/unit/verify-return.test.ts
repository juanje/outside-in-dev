import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { recordCheckpoint } from "../../src/artifacts/checkpoint.js";
import { loadProgress } from "../../src/artifacts/progress.js";
import { readReturn, recordReturn } from "../../src/artifacts/return-record.js";
import { hasGreenEvidence, judgeReturn, moveFeature } from "../../src/commands/verify-return.js";
import { commitAll } from "./git-fixture.js";
import { FEATURE, RED, isSource } from "./red-fixture.js";
import { dir, useTempDir, write, writeProgressFile } from "./temp-project.js";

useTempDir();

/** A project whose cycle wrote src/a.ts after the Red, and whose feature went back to bdd_red from `from`. */
function goBack(from: string): void {
  write("src/a.ts", "export const a = 1;\n");
  commitAll();
  recordCheckpoint(dir, RED);
  write("src/a.ts", "export const a = 2;\n");
  recordReturn(dir, FEATURE, from);
}

describe("judgeReturn", () => {
  it("refuses, without running the scenario, when source changed since the return", () => {
    goBack("tdd_green");
    write("src/a.ts", "export const a = 3;\n");
    const passes = vi.fn(() => true);
    expect(judgeReturn(dir, FEATURE, isSource, passes)).toEqual({ kind: "refused", reason: "src/a.ts changed since the return" });
    expect(passes).not.toHaveBeenCalled();
  });

  it("refuses when the scenario does not pass", () => {
    goBack("tdd_green");
    expect(judgeReturn(dir, FEATURE, isSource, () => false)).toEqual({ kind: "refused", reason: "the scenario does not pass" });
  });

  it("refuses when the scenario also passes without this cycle's code, and leaves the code as it found it", () => {
    goBack("tdd_green");
    const runs: string[] = [];
    const passes = (): boolean => {
      runs.push(readFileSync(join(dir, "src/a.ts"), "utf8"));
      return true;
    };
    expect(judgeReturn(dir, FEATURE, isSource, passes)).toEqual({ kind: "refused", reason: "the scenario passes without this cycle's code" });
    expect(runs).toEqual(["export const a = 2;\n", "export const a = 1;\n"]);
    expect(readFileSync(join(dir, "src/a.ts"), "utf8")).toBe("export const a = 2;\n");
  });

  it("returns to the step the feature came from, naming the code of the cycle, when the scenario passes only with it", () => {
    goBack("refactor");
    const passes = (): boolean => readFileSync(join(dir, "src/a.ts"), "utf8") === "export const a = 2;\n";
    expect(judgeReturn(dir, FEATURE, isSource, passes)).toEqual({ kind: "returned", to: "refactor", files: ["src/a.ts"] });
  });

  it("leaves a cycle with no code to the usual rules, without running the scenario", () => {
    write("src/a.ts", "export const a = 1;\n");
    commitAll();
    recordCheckpoint(dir, RED);
    recordReturn(dir, FEATURE, "tdd_red");
    const passes = vi.fn(() => true);
    expect(judgeReturn(dir, FEATURE, isSource, passes)).toEqual({ kind: "no_code" });
    expect(passes).not.toHaveBeenCalled();
  });

  it("moves the feature to a step by writing the progress, and forgets the return", () => {
    goBack("tdd_green");
    writeProgressFile({ current_focus: FEATURE, features: [{ id: FEATURE, title: "Alpha", status: "in_progress", cycle_step: "bdd_red", scenarios: [] }] });
    moveFeature(dir, "progress.json", FEATURE, "tdd_green");
    expect(loadProgress(dir).features[0]?.cycle_step).toBe("tdd_green");
    expect(readReturn(dir, FEATURE)).toBeUndefined();
  });

  it("knows a scenario recorded as passing that an earlier green ran, until something changes", () => {
    write("src/a.ts", "export const a = 1;\n");
    commitAll();
    const scenarios = [{ feature: FEATURE, name: "S" }];
    writeProgressFile({ current_focus: FEATURE, features: [{ id: FEATURE, title: "Alpha", status: "in_progress", cycle_step: "bdd_red", scenarios: [{ name: "S", bdd: "pass" }] }] });
    expect(hasGreenEvidence(dir, "progress.json", FEATURE, "S")).toBe(false);
    recordCheckpoint(dir, { ...RED, step: "tdd_green", verify: { kind: "green", target: "all" }, scenarios });
    expect(hasGreenEvidence(dir, "progress.json", FEATURE, "S")).toBe(true);
    write("src/a.ts", "export const a = 2;\n");
    expect(hasGreenEvidence(dir, "progress.json", FEATURE, "S")).toBe(false);
  });

  it("does not take a green that ran a scenario as evidence while the progress does not record it as passing", () => {
    write("src/a.ts", "export const a = 1;\n");
    commitAll();
    writeProgressFile({ current_focus: FEATURE, features: [{ id: FEATURE, title: "Alpha", status: "in_progress", cycle_step: "bdd_red", scenarios: [{ name: "S", bdd: "pending" }] }] });
    recordCheckpoint(dir, { ...RED, step: "tdd_green", verify: { kind: "green", target: "all" }, scenarios: [{ feature: FEATURE, name: "S" }] });
    expect(hasGreenEvidence(dir, "progress.json", FEATURE, "S")).toBe(false);
  });
});
