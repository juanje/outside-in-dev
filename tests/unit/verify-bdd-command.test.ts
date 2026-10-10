import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commitAll } from "./git-fixture.js";
import { scenarioMessages } from "./cucumber-messages.js";
import { runInProject } from "./run-capture.js";
import { REAL_PROCESS_TIMEOUT_MS, dir, useTempDir, write, writeMinimalConfig } from "./temp-project.js";

useTempDir();

const TARGET = "features/a.feature:3";
const COMMANDS = { bdd: "node bdd-runner.mjs", unit: "u", typecheck: "t", format: null, lint: null, coverage: null, extra_checks: [] };
const passed = { status: "PASSED" };

/** A project whose BDD runner is a script that writes `report` where oid asks for it, prints `stderr` and exits with `exitCode`. */
function projectWithRunner({ report, stderr = "", exitCode = 1 }: { report: string | undefined; stderr?: string; exitCode?: number }): void {
  writeMinimalConfig({ commands: COMMANDS, paths: { source: ["src/**"], shared: [], unit_tests: [], bdd_features: [], bdd_steps: ["features/steps/**"], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" } });
  write("canned.ndjson", report ?? "");
  write(
    "bdd-runner.mjs",
    `import { copyFileSync, existsSync } from "node:fs";\nconst out = process.argv.find((arg) => arg.startsWith("message:")).slice("message:".length);\nif (${report !== undefined}) copyFileSync("canned.ndjson", out);\nprocess.stderr.write(${JSON.stringify(stderr)});\nprocess.exit(${exitCode});\n`,
  );
}

/** The failure of a step that imports `module` from the project, which does not exist. */
function missingModule(module: string): { status: string; message: string } {
  return { status: "FAILED", message: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '${dir}/${module}' imported from ${dir}/features/steps/a.steps.ts\n    at x` };
}

describe("oid verify red <feature>:<line>", () => {
  it("accepts a step of a source module that does not exist yet: exit 0 and a checkpoint of the BDD Red", async () => {
    projectWithRunner({ report: scenarioMessages([passed, missingModule("src/nope.js")]) });
    commitAll();
    write("features/steps/a.steps.ts", "// the steps\n");
    expect(await runInProject(["verify", "red", TARGET])).toEqual({
      exitCode: 0,
      stdout: "red: valid (missing_implementation): the module src/nope.js does not exist yet\n",
      stderr: "",
    });
    expect(JSON.parse(readFileSync(join(dir, ".outside-in/checkpoint.json"), "utf8"))).toMatchObject({
      step: "bdd_red",
      verify: { kind: "red", target: TARGET },
      external: false,
      snapshot: { "features/steps/a.steps.ts": expect.any(String) },
    });
  }, REAL_PROCESS_TIMEOUT_MS);

  it("verifies a scenario named by its name, as the scenario at its location", async () => {
    projectWithRunner({ report: scenarioMessages([passed, missingModule("src/nope.js")]) });
    writeMinimalConfig({ commands: COMMANDS, paths: { source: ["src/**"], shared: [], unit_tests: [], bdd_features: ["features/**/*.feature"], bdd_steps: ["features/steps/**"], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" } });
    write("features/a.feature", "Feature: A\n\n  Scenario: Adds\n    Given it adds\n");
    commitAll();
    write("features/steps/a.steps.ts", "// the steps\n");
    expect(await runInProject(["verify", "red", "Adds"])).toEqual({
      exitCode: 0,
      stdout: "red: valid (missing_implementation): the module src/nope.js does not exist yet\n",
      stderr: "",
    });
  });

  it("rejects a run that never started when its stderr names a step file that changed since the last commit", async () => {
    projectWithRunner({ report: undefined, stderr: `Error: Transform failed\n${dir}/features/steps/a.steps.ts:2:6: ERROR\n` });
    write("features/steps/a.steps.ts", "// committed\n");
    commitAll();
    write("features/steps/a.steps.ts", "const = ;\n");
    expect(await runInProject(["verify", "red", TARGET])).toEqual({
      exitCode: 1,
      stdout: `red: not valid (test_bug): the BDD runner did not start and names features/steps/a.steps.ts, which changed since the last checkpoint:\n  Error: Transform failed\n  ${dir}/features/steps/a.steps.ts:2:6: ERROR\n`,
      stderr: "",
    });
  });

  it("resolves a name that is not a function against the module that the step file named by the failure's stack imports it from", async () => {
    write("src/greeting.ts", "export const greeting = 'hi';\n");
    write("features/steps/a.steps.ts", 'Then("it", async function () {\n  const { shout } = await import("../../src/greeting.js");\n  shout();\n});\n');
    const failure = { status: "FAILED", message: `TypeError: shout is not a function\n    at World.<anonymous> (${dir}/features/steps/a.steps.ts:3:3)` };
    projectWithRunner({ report: scenarioMessages([passed, failure]) });
    commitAll();
    expect(await runInProject(["verify", "red", TARGET])).toEqual({
      exitCode: 0,
      stdout: "red: valid (missing_implementation): shout does not exist yet\n",
      stderr: "",
    });
  });
});
