import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findingLines, summaryCount } from "./metrics-output.js";
import { dir, useTempDir, REAL_PROCESS_TIMEOUT_MS } from "./temp-project.js";
import { runOid } from "./run-capture.js";
import { commitAll } from "./git-fixture.js";

useTempDir();

describe("oid metrics --changed", () => {
  it("prints only the findings on lines changed since HEAD and counts them", async () => {
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
    writeFileSync(join(dir, "src/steady.ts"), "export const isSteady = (n: number) => n > 5;\n");
    writeFileSync(join(dir, "src/moving.ts"), "export const isMoving = (n: number) => n > 7;\n");
    commitAll();
    writeFileSync(join(dir, "src/moving.ts"), "export const isMoving = (n: number) => n > 8;\n");
    const { stdout } = await runOid(["metrics", "--changed"], dir);
    expect(findingLines(stdout, "magic_value")).toEqual(["magic_value src/moving.ts:1-1 magic number 8"]);
    expect(summaryCount(stdout, "magic_value")).toBe(1);
  }, REAL_PROCESS_TIMEOUT_MS);
});
