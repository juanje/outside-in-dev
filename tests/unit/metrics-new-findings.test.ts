import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findingLines } from "./metrics-output.js";
import { dir, useTempDir, REAL_PROCESS_TIMEOUT_MS } from "./temp-project.js";
import { runOid } from "./run-capture.js";
import { commitAll } from "./git-fixture.js";

useTempDir();

/** Runs `oid metrics` with `args` in the temporary project. */
const metrics = (...args: string[]) => runOid(["metrics", ...args], dir);

/** A committed project with one magic number. */
function committedProject(): void {
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
  writeFileSync(join(dir, "src/limits.ts"), "export const isLong = (n: number) => n > 42;\n");
  commitAll();
}

/** A committed project with one magic number, whose finding is recorded as the baseline. */
async function baselinedProject(): Promise<void> {
  committedProject();
  await metrics("--baseline");
}

describe("oid metrics --changed with a baseline", () => {
  it("leaves out the findings of the baseline, and says how many", async () => {
    await baselinedProject();
    writeFileSync(join(dir, "src/limits.ts"), "export const isLong = (n: number): boolean => n > 42;\nexport const isHuge = (n: number) => n > 77;\n");
    const { stdout } = await metrics("--changed");
    expect(findingLines(stdout, "magic_value")).toEqual(["magic_value src/limits.ts:2-2 magic number 77"]);
    expect(stdout).toMatch(/^1 existing finding left out$/m);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("fails when a finding that is not in the baseline remains, and succeeds when only findings of the baseline are left", async () => {
    await baselinedProject();
    writeFileSync(join(dir, "src/limits.ts"), "export const isLong = (n: number): boolean => n > 42;\n");
    expect((await metrics("--changed")).exitCode).toBe(0);
    writeFileSync(join(dir, "src/limits.ts"), "export const isLong = (n: number): boolean => n > 42;\nexport const isHuge = (n: number) => n > 77;\n");
    expect((await metrics("--changed")).exitCode).toBe(1);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("says once on the error output that there is no baseline, and treats every finding as new", async () => {
    committedProject();
    writeFileSync(join(dir, "src/limits.ts"), "export const isLong = (n: number): boolean => n > 42;\n");
    const { stdout, stderr } = await metrics("--changed");
    expect(findingLines(stdout, "magic_value")).toEqual(["magic_value src/limits.ts:1-1 magic number 42"]);
    expect(stderr.match(/no baseline.*oid metrics --baseline/g)).toHaveLength(1);
  });
});
