import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { recordCheckpoint } from "../../src/artifacts/checkpoint.js";
import { loadProgress } from "../../src/artifacts/progress.js";
import { readReturn } from "../../src/artifacts/return-record.js";
import { scenarioMessages } from "./cucumber-messages.js";
import { commitAll } from "./git-fixture.js";
import { FEATURE, RED } from "./red-fixture.js";
import { runInProject } from "./run-capture.js";
import { dir, useTempDir, write, writeMinimalConfig, writeProgressFile, REAL_PROCESS_TIMEOUT_MS } from "./temp-project.js";

useTempDir();

const TARGET = "features/a.feature:3";
const COMMANDS = { bdd: "node bdd-runner.mjs", unit: "u", typecheck: "t", format: null, lint: null, coverage: null, extra_checks: [] };
const PATHS = { source: ["src/**"], shared: [], unit_tests: [], bdd_features: ["features/**/*.feature"], bdd_steps: ["features/steps/**"], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" };

/** A project whose BDD runner passes the scenario only when `src/a.ts` holds the code of this cycle (`2`), and whose feature went back to bdd_red from `from`. */
function goBack(from: string): void {
  writeMinimalConfig({ commands: COMMANDS, paths: PATHS });
  write("canned-pass.ndjson", scenarioMessages([{ status: "PASSED" }]));
  const missing = `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '${dir}/src/nope.js' imported from ${dir}/features/steps/a.steps.ts\n    at x`;
  write("canned-fail.ndjson", scenarioMessages([{ status: "FAILED", message: missing }]));
  write(
    "bdd-runner.mjs",
    `import { copyFileSync, readFileSync } from "node:fs";\nconst out = process.argv.find((arg) => arg.startsWith("message:")).slice("message:".length);\nconst ok = readFileSync("src/a.ts", "utf8").includes("2");\ncopyFileSync(ok ? "canned-pass.ndjson" : "canned-fail.ndjson", out);\nprocess.exit(ok ? 0 : 1);\n`,
  );
  write("features/a.feature", "Feature: A\n\n  Scenario: Adds\n    Given it adds\n");
  write("src/a.ts", "export const a = 1;\n");
  writeProgressFile({ current_focus: FEATURE, features: [{ id: FEATURE, title: "Alpha", status: "in_progress", cycle_step: from, scenarios: [] }] });
  commitAll();
  recordCheckpoint(dir, RED);
  write("src/a.ts", "export const a = 2;\n");
}

describe("oid verify red <scenario> at bdd_red after a return", () => {
  it("returns the feature to the step it came from when the scenario passes only with the code of the cycle, and leaves the code in place", async () => {
    goBack("tdd_green");
    await runInProject(["progress", "step", FEATURE, "bdd_red"]);
    write("features/steps/a.steps.ts", "// fixed step\n");
    expect(await runInProject(["verify", "red", TARGET])).toEqual({
      exitCode: 0,
      stdout: "red: returned to tdd_green: the scenario passes, src/ is as it was at the return, and it fails without this cycle's code (src/a.ts)\n",
      stderr: "",
    });
    expect(loadProgress(dir).features[0]?.cycle_step).toBe("tdd_green");
    expect(readReturn(dir, FEATURE)).toBeUndefined();
    expect(JSON.parse(readFileSync(join(dir, `.outside-in/checkpoints/${FEATURE}.json`), "utf8"))).toMatchObject({ step: "bdd_red" });
    expect(readFileSync(join(dir, "src/a.ts"), "utf8")).toBe("export const a = 2;\n");
  }, REAL_PROCESS_TIMEOUT_MS);

  it("moves a feature with no code in the cycle to tdd_red when the scenario fails as a valid Red, and forgets the return", async () => {
    goBack("tdd_red");
    write("src/a.ts", "export const a = 1;\n");
    await runInProject(["progress", "step", FEATURE, "bdd_red"]);
    write("features/steps/a.steps.ts", "// fixed step\n");
    const run = await runInProject(["verify", "red", TARGET]);
    expect(run.stdout).toBe("red: valid (missing_implementation): the module src/nope.js does not exist yet\nred: moved to tdd_red\n");
    expect(run.exitCode).toBe(0);
    expect(loadProgress(dir).features[0]?.cycle_step).toBe("tdd_red");
    expect(readReturn(dir, FEATURE)).toBeUndefined();
  });

  it("moves a feature with no code in the cycle to tdd_red when the scenario already passes: the unit test is still needed", async () => {
    goBack("tdd_red");
    recordCheckpoint(dir, RED);
    await runInProject(["progress", "step", FEATURE, "bdd_red"]);
    write("features/steps/a.steps.ts", "// fixed step\n");
    expect(await runInProject(["verify", "red", TARGET])).toEqual({ exitCode: 0, stdout: "red: moved to tdd_red: the scenario already passes; the unit test is still needed\n", stderr: "" });
    expect(loadProgress(dir).features[0]?.cycle_step).toBe("tdd_red");
    expect(JSON.parse(readFileSync(join(dir, `.outside-in/checkpoints/${FEATURE}.json`), "utf8"))).toMatchObject({ step: "bdd_red" });
  });

  it("moves a feature with no return to tdd_red when the scenario passes and is recorded as passing with the evidence of an earlier green", async () => {
    goBack("bdd_red");
    writeProgressFile({ current_focus: FEATURE, features: [{ id: FEATURE, title: "Alpha", status: "in_progress", cycle_step: "bdd_red", scenarios: [{ name: "Adds", bdd: "pass" }] }] });
    recordCheckpoint(dir, { ...RED, step: "tdd_green", verify: { kind: "green", target: "all" }, scenarios: [{ feature: FEATURE, name: "Adds" }] });
    expect(await runInProject(["verify", "red", TARGET])).toEqual({ exitCode: 0, stdout: "red: moved to tdd_red: the scenario already passes and an earlier green ran it\n", stderr: "" });
    expect(loadProgress(dir).features[0]?.cycle_step).toBe("tdd_red");
  });

  it("still takes a scenario that passes at once for no Red in a project with no progress file", async () => {
    goBack("bdd_red");
    rmSync(join(dir, "progress.json"));
    const run = await runInProject(["verify", "red", TARGET]);
    expect(run.exitCode).toBe(1);
    expect(run.stdout).toMatch(/^red: not valid \(test_bug\)/);
  });
});
