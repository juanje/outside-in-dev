import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { recordCheckpoint } from "../../src/artifacts/checkpoint.js";
import { loadProgress } from "../../src/artifacts/progress.js";
import { readReturn } from "../../src/artifacts/return-record.js";
import { commitAll } from "./git-fixture.js";
import { FEATURE, RED } from "./red-fixture.js";
import { COMMANDS, PATHS, TARGET } from "./return-unit-fixture.js";
import { runInProject } from "./run-capture.js";
import { dir, useTempDir, write, writeMinimalConfig, writeProgressFile, REAL_PROCESS_TIMEOUT_MS } from "./temp-project.js";

useTempDir();


const runner = `
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
const out = process.argv.find((arg) => arg.startsWith("--outputFile=")).slice("--outputFile=".length);
const code = readFileSync("src/a.ts", "utf8");
appendFileSync("runs.log", code);
const file = (message, tests) => ({ name: process.cwd() + "/tests/unit/a.test.ts", status: message ? "failed" : "passed", message, assertionResults: tests });
const adds = (status, failureMessages) => ({ fullName: "adds", title: "adds", status, failureMessages });
const result = readFileSync("tests/unit/a.test.ts", "utf8").includes("assertion")
  ? file("", [adds("failed", ["AssertionError: expected 3 to be 4\\n    at x"])])
  : code.includes("2") || code.includes("4")
    ? file("", [adds("passed", [])])
    : file("Cannot find module '../../src/nope.js' imported from '" + process.cwd() + "/tests/unit/a.test.ts'", []);
writeFileSync(out, JSON.stringify({ testResults: [result] }));
`;

/** A project whose unit runner passes the test only when src/a.ts holds the code of this cycle (it contains 2), and whose feature went back to tdd_red from `from`. */
async function goBack(from: string, { base = "export const a = 1;\n", cycleCode = "export const a = 2;\n" }: { base?: string; cycleCode?: string | undefined } = {}): Promise<void> {
  writeMinimalConfig({ commands: COMMANDS, paths: PATHS });
  write("runner.mjs", runner);
  write("tests/unit/a.test.ts", "// the test\n");
  write("src/a.ts", base);
  writeProgressFile({ current_focus: FEATURE, features: [{ id: FEATURE, title: "Alpha", status: "in_progress", cycle_step: from, scenarios: [] }] });
  commitAll();
  recordCheckpoint(dir, RED);
  if (cycleCode !== undefined) write("src/a.ts", cycleCode);
  await runInProject(["progress", "step", FEATURE, "tdd_red"]);
  write("tests/unit/a.test.ts", "// the fixed test\n");
}

const checkpointStep = (): unknown => JSON.parse(readFileSync(join(dir, `.outside-in/checkpoints/${FEATURE}.json`), "utf8"));
const redBaseSnapshot = (): Record<string, string> => JSON.parse(readFileSync(join(dir, `.outside-in/checkpoints/${FEATURE}.red.json`), "utf8")).snapshot;

describe("oid verify red <test> at tdd_red after a return", () => {
  it("returns the feature to the step it came from when the test passes only with the code of the cycle, and leaves the code in place", async () => {
    await goBack("quality_gate");
    expect(await runInProject(["verify", "red", TARGET])).toEqual({
      exitCode: 0,
      stdout: "red: returned to quality_gate: the test passes, src/ is as it was at the return, and it fails without this cycle's code (src/a.ts)\n",
      stderr: "",
    });
    expect(loadProgress(dir).features[0]?.cycle_step).toBe("quality_gate");
    expect(readReturn(dir, FEATURE)).toBeUndefined();
    expect(checkpointStep()).toMatchObject({ step: "tdd_red" });
    expect(Object.keys(redBaseSnapshot())).not.toContain("src/a.ts");
    expect(readFileSync(join(dir, "runs.log"), "utf8")).toBe("export const a = 2;\nexport const a = 1;\n");
    expect(statSync(join(dir, "src/a.ts")).size).toBe("export const a = 2;\n".length);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("does not return the feature when source changed since the return, naming the file", async () => {
    await goBack("tdd_green");
    write("src/a.ts", "export const a = 4;\n");
    const run = await runInProject(["verify", "red", TARGET]);
    expect(run).toEqual({ exitCode: 1, stdout: "red: not returned: src/a.ts changed since the return\n", stderr: "" });
    expect(loadProgress(dir).features[0]?.cycle_step).toBe("tdd_red");
  }, REAL_PROCESS_TIMEOUT_MS);

  it("does not return the feature when the test also passes without this cycle's code, and restores the code", async () => {
    await goBack("refactor", { base: "export const a = 2;\n", cycleCode: "export const a = 22;\n" });
    expect(await runInProject(["verify", "red", TARGET])).toEqual({ exitCode: 1, stdout: "red: not returned: the test passes without this cycle's code\n", stderr: "" });
    expect(readFileSync(join(dir, "runs.log"), "utf8")).toBe("export const a = 22;\nexport const a = 2;\n");
    expect(statSync(join(dir, "src/a.ts")).size).toBe("export const a = 22;\n".length);
    expect(loadProgress(dir).features[0]?.cycle_step).toBe("tdd_red");
  }, REAL_PROCESS_TIMEOUT_MS);

  it("judges a test that fails as any Red and keeps the feature at tdd_red", async () => {
    await goBack("tdd_green");
    write("tests/unit/a.test.ts", "// an assertion that fails\n");
    const run = await runInProject(["verify", "red", TARGET]);
    expect(run.exitCode).toBe(2);
    expect(run.stdout).toMatch(/^red: needs a decision/);
    expect(loadProgress(dir).features[0]?.cycle_step).toBe("tdd_red");
  }, REAL_PROCESS_TIMEOUT_MS);

  it("takes a test that passes with no code in this cycle for no Red", async () => {
    await goBack("quality_gate", { base: "export const a = 2;\n", cycleCode: undefined });
    const run = await runInProject(["verify", "red", TARGET]);
    expect(run.exitCode).toBe(1);
    expect(run.stdout).toMatch(/^red: not valid \(test_bug\)/);
  }, REAL_PROCESS_TIMEOUT_MS);
});
