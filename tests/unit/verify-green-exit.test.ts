import { describe, expect, it } from "vitest";
import { runMessages } from "./cucumber-run-messages.js";
import { commitAll } from "./git-fixture.js";
import { RUNNER_COMMANDS, RUNNER_PATHS } from "./green-runners.js";
import { runInProject } from "./run-capture.js";
import { useTempDir, write, writeMinimalConfig, writeProgressFile, REAL_PROCESS_TIMEOUT_MS } from "./temp-project.js";

useTempDir();

const COMMANDS = RUNNER_COMMANDS;
const PATHS = RUNNER_PATHS;
const PASSED_TEST = { fullName: "adds", title: "adds", status: "passed", failureMessages: [] };
const ONE_PASSED = { testResults: [{ name: "/p/tests/unit/a.test.ts", message: "", assertionResults: [PASSED_TEST] }] };

/** A project whose runners write the given reports and exit with the given codes. */
function projectWithRunners({ unitReport = ONE_PASSED, unitExit = 0, bddReport = "", bddExit = 0 }: { unitReport?: unknown; unitExit?: number; bddReport?: string; bddExit?: number }): void {
  writeMinimalConfig({ commands: COMMANDS, paths: PATHS });
  write("canned.ndjson", bddReport);
  write("unit-runner.mjs", `import { writeFileSync } from "node:fs";\nconst out = process.argv.find((arg) => arg.startsWith("--outputFile=")).slice("--outputFile=".length);\nwriteFileSync(out, ${JSON.stringify(JSON.stringify(unitReport))});\nprocess.exit(${unitExit});\n`);
  write("bdd-runner.mjs", `import { copyFileSync } from "node:fs";\nconst out = process.argv.find((arg) => arg.startsWith("message:")).slice("message:".length);\ncopyFileSync("canned.ndjson", out);\nprocess.exit(${bddExit});\n`);
  write("tsc-runner.mjs", "process.exit(0);\n");
}

describe("oid verify green and the exit of the runners", () => {
  it("rejects a unit run that exits with an error and reports no test: the runner's exit is part of the evidence", async () => {
    projectWithRunners({ unitReport: { testResults: [] }, unitExit: 1 });
    commitAll();
    const { exitCode, stdout } = await runInProject(["verify", "green"]);
    expect({ exitCode, ok: stdout.startsWith("green: ok") }).toEqual({ exitCode: 1, ok: false });
  }, REAL_PROCESS_TIMEOUT_MS);

  it("rejects a unit run that exits with an error although every test in its report passed", async () => {
    projectWithRunners({ unitExit: 1 });
    commitAll();
    expect(await runInProject(["verify", "green"])).toMatchObject({ exitCode: 1, stdout: "green: 1 problem(s)\nunit: the runner exited 1 but its report names no failing test\n" });
  });

  it("rejects a scenario whose steps all passed when one of its hooks failed", async () => {
    const lines = runMessages([{ uri: "features/a.feature", name: "Adds", steps: [{ text: "it adds", status: "PASSED" }] }]).split("\n").map((line) => JSON.parse(line));
    lines.find((line) => line.testCase).testCase.testSteps.push({ id: "after", hookId: "h1" });
    lines.push({ testStepFinished: { testCaseStartedId: "r0", testStepId: "after", testStepResult: { status: "FAILED", message: "Error: cleanup failed\n    at x" } } });
    projectWithRunners({ bddReport: lines.map((line) => JSON.stringify(line)).join("\n"), bddExit: 1 });
    write("features/a.feature", "@FR-A-01\nFeature: A\n\n  Scenario: Adds\n    Given it adds\n");
    writeProgressFile({ current_focus: "FR-A-01", features: [{ id: "FR-A-01", title: "A", status: "in_progress", cycle_step: "tdd_green", scenarios: [{ name: "Adds", bdd: "pass" }] }] });
    commitAll();
    expect(await runInProject(["verify", "green"])).toMatchObject({ exitCode: 1, stdout: "green: 1 problem(s)\nbdd features/a.feature:4 Adds: a hook (Error: cleanup failed)\n" });
  });

  it("rejects a BDD run that exits with an error although every scenario in its report passed", async () => {
    projectWithRunners({ bddReport: runMessages([{ uri: "features/a.feature", name: "Adds", steps: [{ text: "it adds", status: "PASSED" }] }]), bddExit: 1 });
    write("features/a.feature", "@FR-A-01\nFeature: A\n\n  Scenario: Adds\n    Given it adds\n");
    writeProgressFile({ current_focus: "FR-A-01", features: [{ id: "FR-A-01", title: "A", status: "in_progress", cycle_step: "tdd_green", scenarios: [{ name: "Adds", bdd: "pass" }] }] });
    commitAll();
    expect(await runInProject(["verify", "green"])).toMatchObject({ exitCode: 1, stdout: "green: 1 problem(s)\nbdd: the runner exited 1 but its report names no failing scenario\n" });
  });
});
