import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { recordCheckpoint } from "../../src/artifacts/checkpoint.js";
import { loadProgress } from "../../src/artifacts/progress.js";
import { runCli } from "../../src/run-cli.js";
import { commitAll } from "./git-fixture.js";
import { FEATURE, RED } from "./red-fixture.js";
import { COMMANDS, PATHS, TARGET } from "./return-unit-fixture.js";
import { runInProject } from "./run-capture.js";
import { dir, REAL_PROCESS_TIMEOUT_MS, useTempDir, write, writeMinimalConfig, writeProgressFile } from "./temp-project.js";

useTempDir();

/** A unit runner whose test passes with `a = 2`, fails an assertion with `a = 3` and fails with a type error with `a = 9`. */
const runner = `
import { readFileSync, writeFileSync } from "node:fs";
const out = process.argv.find((arg) => arg.startsWith("--outputFile=")).slice("--outputFile=".length);
const code = readFileSync("src/a.ts", "utf8");
const status = code.includes("= 2") ? "passed" : "failed";
const message = code.includes("= 9") ? "TypeError: (0 , a) is not a function\\n    at x" : "AssertionError: expected 3 to be 2\\n    at x";
const adds = { fullName: "adds", title: "adds", status, failureMessages: status === "passed" ? [] : [message] };
writeFileSync(out, JSON.stringify({ testResults: [{ name: process.cwd() + "/tests/unit/a.test.ts", status, message: "", assertionResults: [adds] }] }));
`;

const diff = (name: string, from: string, to: string): string => `--- a/${name}\n+++ b/${name}\n@@ -1 +1 @@\n-${from}\n+${to}\n`;
const MUTANT = diff("src/a.ts", "export const a = 2;", "export const a = 3;");

/** A project whose code of an earlier cycle makes the test pass, and whose feature went back to tdd_red from tdd_green with the test fixed. */
async function fixedTestOfAnEarlierCycle(step = "tdd_red"): Promise<void> {
  writeMinimalConfig({ commands: COMMANDS, paths: PATHS });
  write("runner.mjs", runner);
  write("tests/unit/a.test.ts", "// the test\n");
  write("src/a.ts", "export const a = 2;\n");
  writeProgressFile({ current_focus: FEATURE, features: [{ id: FEATURE, title: "Alpha", status: "in_progress", cycle_step: "tdd_green", scenarios: [] }] });
  commitAll();
  recordCheckpoint(dir, RED);
  if (step === "tdd_red") await runInProject(["progress", "step", FEATURE, "tdd_red"]);
  write("tests/unit/a.test.ts", "// the fixed test\n");
  write("mutant.diff", MUTANT);
}

const verify = (...options: string[]) => runInProject(["verify", "red", TARGET, ...options]);
const read = (name: string): string => readFileSync(join(dir, name), "utf8");
const cycleStep = (): string | undefined => loadProgress(dir).features[0]?.cycle_step;

describe("oid verify red <test> --mutant", () => {
  it("returns the feature to the step it came from when the test passes and fails on an assertion with the mutant, records the diff in the checkpoint and restores the source", { timeout: REAL_PROCESS_TIMEOUT_MS }, async () => {
    await fixedTestOfAnEarlierCycle();
    expect(await verify("--mutant", "mutant.diff")).toEqual({
      exitCode: 0,
      stdout: "red: returned to tdd_green: the test passes, src/ is as it was at the return, and it fails with the mutant on an assertion (src/a.ts)\n",
      stderr: "",
    });
    expect(cycleStep()).toBe("tdd_green");
    expect(JSON.parse(read(`.outside-in/checkpoints/${FEATURE}.json`))).toMatchObject({ step: "tdd_red", verify: { mutant: MUTANT } });
    expect(read("src/a.ts")).toBe("export const a = 2;\n");
  });

  it("reads the diff from standard input with `-`", { timeout: REAL_PROCESS_TIMEOUT_MS }, async () => {
    await fixedTestOfAnEarlierCycle();
    const io = { cwd: dir, stdout: () => undefined, stderr: () => undefined };
    expect(await runCli(["verify", "red", TARGET, "--mutant", "-"], io, { pid: process.pid, readStdinSync: () => MUTANT } as never)).toBe(0);
    expect(JSON.parse(read(`.outside-in/checkpoints/${FEATURE}.json`))).toMatchObject({ verify: { mutant: MUTANT } });
  });

  it("refuses, with the reason and no change, a diff that does not apply, one that leaves the test passing, and one that breaks it with a type error", { timeout: REAL_PROCESS_TIMEOUT_MS }, async () => {
    await fixedTestOfAnEarlierCycle();
    const refusals: string[] = [];
    for (const [name, text] of [
      ["stale.diff", diff("src/a.ts", "export const a = 5;", "export const a = 3;")],
      ["same.diff", diff("src/a.ts", "export const a = 2;", "export const a = 2; // same")],
      ["type.diff", diff("src/a.ts", "export const a = 2;", "export const a = 9;")],
    ] as const) {
      write(name, text);
      const run = await verify("--mutant", name);
      expect(run.exitCode).toBe(1);
      refusals.push(run.stdout.split("\n")[0]!);
    }
    expect(refusals).toEqual([
      "red: mutant refused: the diff does not apply",
      "red: mutant refused: the test still passes with the mutant",
      "red: mutant refused: the test fails with the mutant, but not on an assertion of the test",
    ]);
    expect(cycleStep()).toBe("tdd_red");
    expect(read("src/a.ts")).toBe("export const a = 2;\n");
  });

  it("refuses a diff that changes a file outside the source before applying it, naming the file", { timeout: REAL_PROCESS_TIMEOUT_MS }, async () => {
    await fixedTestOfAnEarlierCycle();
    write("weaken.diff", diff("tests/unit/a.test.ts", "// the fixed test", "// weaker"));
    const run = await verify("--mutant", "weaken.diff");
    expect(run.exitCode).toBe(1);
    expect(run.stdout).toContain("red: mutant refused: tests/unit/a.test.ts is not source: the mutant may change only the source");
    expect(read("tests/unit/a.test.ts")).toBe("// the fixed test\n");
  });

  it("refuses a test of a feature that did not go back to a Red, without running it", { timeout: REAL_PROCESS_TIMEOUT_MS }, async () => {
    await fixedTestOfAnEarlierCycle("tdd_green");
    const run = await verify("--mutant", "mutant.diff");
    expect(run.exitCode).toBe(1);
    expect(run.stdout).toContain("red: mutant refused: the feature did not go back to a Red");
  });

  it("is a usage error with --decide, with a file that does not exist and with no file", { timeout: REAL_PROCESS_TIMEOUT_MS }, async () => {
    await fixedTestOfAnEarlierCycle();
    const errors = [await verify("--mutant", "mutant.diff", "--decide", "test_bug"), await verify("--mutant", "none.diff"), await verify("--mutant")].map(({ exitCode, stderr }) => ({ exitCode, stderr }));
    expect(errors).toEqual([
      { exitCode: 1, stderr: expect.stringContaining("--mutant cannot be used with --decide") },
      { exitCode: 1, stderr: expect.stringContaining("mutant file none.diff not found") },
      { exitCode: 1, stderr: expect.stringContaining("--mutant needs a file, or - for standard input") },
    ]);
  });
});
