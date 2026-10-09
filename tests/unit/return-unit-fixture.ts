import { recordCheckpoint } from "../../src/artifacts/checkpoint.js";
import { commitAll } from "./git-fixture.js";
import { FEATURE, RED } from "./red-fixture.js";
import { runInProject } from "./run-capture.js";
import { dir, write, writeMinimalConfig, writeProgressFile } from "./temp-project.js";

/** The test the return tests verify. */
export const TARGET = "tests/unit/a.test.ts > adds";
/** The commands of the project of the return tests: only the unit runner is real. */
export const COMMANDS = { bdd: "b", unit: "node runner.mjs", typecheck: "t", format: null, lint: null, coverage: null, extra_checks: [] };
/** The paths of the project of the return tests. */
export const PATHS = { source: ["src/**"], shared: [], unit_tests: ["tests/unit/**"], bdd_features: [], bdd_steps: [], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" };

/** A unit runner whose test passes only with the code of the cycle (src/a.ts contains 2) and otherwise fails on an assertion line that existed at the checkpoint. */
const runner = `
import { readFileSync, writeFileSync } from "node:fs";
const out = process.argv.find((arg) => arg.startsWith("--outputFile=")).slice("--outputFile=".length);
const passes = readFileSync("src/a.ts", "utf8").includes("2");
const adds = passes ? { fullName: "adds", title: "adds", status: "passed", failureMessages: [] } : { fullName: "adds", title: "adds", status: "failed", failureMessages: ["AssertionError: expected 1 to be 2\\n    at x"] };
writeFileSync(out, JSON.stringify({ testResults: [{ name: process.cwd() + "/tests/unit/a.test.ts", status: passes ? "passed" : "failed", message: "", assertionResults: [adds] }] }));
`;

/** A project whose feature went back to tdd_red from tdd_green and whose test was fixed, so that it passes with the code of the cycle and fails without it. */
export async function fixedTest(): Promise<void> {
  writeMinimalConfig({ commands: COMMANDS, paths: PATHS });
  write("runner.mjs", runner);
  write("tests/unit/a.test.ts", "// the test\n");
  write("src/a.ts", "export const a = 1;\n");
  writeProgressFile({ current_focus: FEATURE, features: [{ id: FEATURE, title: "Alpha", status: "in_progress", cycle_step: "tdd_green", scenarios: [] }] });
  commitAll();
  recordCheckpoint(dir, RED);
  write("src/a.ts", "export const a = 2;\n");
  await runInProject(["progress", "step", FEATURE, "tdd_red"]);
  write("tests/unit/a.test.ts", "// the fixed test\n");
}

