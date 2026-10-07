import { mkdirSync, writeFileSync } from "node:fs";
import { baselineHolds } from "../../src/artifacts/baseline.js";
import { ProgressError } from "../../src/artifacts/progress.js";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commitAll } from "./git-fixture.js";
import { findingLines } from "./metrics-output.js";
import { runOid } from "./run-capture.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

/** A function whose cyclomatic complexity is `branches + 1`. */
const branchy = (branches: number): string =>
  `export function total(a: boolean): number {\n  let n = 0;\n${"  if (a) n++;\n".repeat(branches)}  return n;\n}\n`;

describe("the baseline and the measure of a complexity finding", () => {
  it("keeps a function whose complexity grew from 11 to 50 out of the existing debt: it is a new finding", async () => {
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
    writeFileSync(join(dir, "src/total.ts"), branchy(10));
    commitAll();
    await runOid(["metrics", "--baseline"], dir);
    writeFileSync(join(dir, "src/total.ts"), branchy(49));
    const { exitCode, stdout } = await runOid(["metrics", "--changed"], dir);
    expect({ exitCode, complexity: findingLines(stdout, "complexity").map((line) => line.replace(/:\d+-\d+/, "")) }).toEqual({
      exitCode: 1,
      complexity: ["complexity src/total.ts [total] cyclomatic complexity 50 > 10"],
    });
  });

  it("still counts a complexity finding as existing when its measure went down, whatever the limit", () => {
    mkdirSync(join(dir, ".outside-in"));
    const recorded = { category: "complexity", file: "src/total.ts", symbol: "total", detail: "cyclomatic complexity N > N", measured: "cyclomatic complexity 50 > 10" };
    writeFileSync(join(dir, ".outside-in/baseline.json"), JSON.stringify([recorded]));
    const holds = baselineHolds(dir)!;
    const finding = (detail: string) => ({ category: "complexity" as const, file: "src/total.ts", range: { start: 1, end: 9 }, symbol: "total", detail });
    expect([holds(finding("cyclomatic complexity 11 > 10")), holds(finding("cyclomatic complexity 50 > 20")), holds(finding("cyclomatic complexity 51 > 10"))]).toEqual([true, true, false]);
  });

  it("refuses a baseline whose complexity record has no measure: it was recorded before measures were kept", () => {
    mkdirSync(join(dir, ".outside-in"));
    writeFileSync(join(dir, ".outside-in/baseline.json"), JSON.stringify([{ category: "complexity", file: "src/total.ts", symbol: "total", detail: "cyclomatic complexity N > N" }]));
    expect(() => baselineHolds(dir)).toThrow(ProgressError);
  });
});
