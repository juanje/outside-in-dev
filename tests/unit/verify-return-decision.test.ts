import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadProgress } from "../../src/artifacts/progress.js";
import { readReturn } from "../../src/artifacts/return-record.js";
import { FEATURE } from "./red-fixture.js";
import { fixedTest, TARGET } from "./return-unit-fixture.js";
import { runInProject } from "./run-capture.js";
import { dir, useTempDir, REAL_PROCESS_TIMEOUT_MS } from "./temp-project.js";

useTempDir();

describe("oid verify red <test> after a return, when the failure without this cycle's code needs a decision", () => {
  it("records the run, prints the decision and leaves the code in place", async () => {
    await fixedTest();
    const run = await runInProject(["verify", "red", TARGET]);
    expect(run.exitCode).toBe(2);
    expect(run.stdout).toMatch(/^red: needs a decision/);
    expect(run.stdout).toContain("the test passes and fails without this cycle's code");
    expect(run.stdout).toContain(`--decide`);
    expect(readFileSync(join(dir, "src/a.ts"), "utf8")).toBe("export const a = 2;\n");
    expect(loadProgress(dir).features[0]?.cycle_step).toBe("tdd_red");
  }, REAL_PROCESS_TIMEOUT_MS);

  it("returns the feature to where it came from when the decision is a valid class", async () => {
    await fixedTest();
    await runInProject(["verify", "red", TARGET]);
    const run = await runInProject(["verify", "red", TARGET, "--decide", "missing_implementation"]);
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toMatch(/^red: returned to tdd_green: .*\(src\/a\.ts\)\n$/);
    expect(loadProgress(dir).features[0]?.cycle_step).toBe("tdd_green");
    expect(readReturn(dir, FEATURE)).toBeUndefined();
    expect(readFileSync(join(dir, "src/a.ts"), "utf8")).toBe("export const a = 2;\n");
  }, REAL_PROCESS_TIMEOUT_MS);

  it("does not return the feature when the decision is not a valid class, naming it", async () => {
    await fixedTest();
    await runInProject(["verify", "red", TARGET]);
    const run = await runInProject(["verify", "red", TARGET, "--decide", "test_bug"]);
    expect(run.exitCode).toBe(1);
    expect(run.stdout).toMatch(/^red: not returned: .*test_bug/);
    expect(loadProgress(dir).features[0]?.cycle_step).toBe("tdd_red");
    expect(readFileSync(join(dir, "src/a.ts"), "utf8")).toBe("export const a = 2;\n");
  }, REAL_PROCESS_TIMEOUT_MS);
});
