import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runMessages } from "./cucumber-run-messages.js";
import { commitAll } from "./git-fixture.js";
import { runInProject } from "./run-capture.js";
import { dir, useTempDir, write, writeMinimalConfig, writeProgressFile } from "./temp-project.js";

useTempDir();

const COMMANDS = { bdd: "node bdd-runner.mjs", unit: "node unit-runner.mjs", typecheck: "node tsc-runner.mjs", format: null, lint: null, coverage: null, extra_checks: [] };
const PATHS = { source: ["src/**"], shared: [], unit_tests: [], bdd_features: ["features/**/*.feature"], bdd_steps: ["features/steps/**"], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" };
const BDD_RAN = "bdd-ran.txt";

/** The report of a unit run in which every test passed. */
const ALL_PASSED = { testResults: [{ name: "/p/tests/unit/a.test.ts", message: "", assertionResults: [{ fullName: "adds", title: "adds", status: "passed", failureMessages: [] }] }] };

/** A project whose three runners are scripts: the unit one writes `unitReport` where oid asks for it, the BDD one `bddReport` (and leaves a mark that it ran), the type check prints `typeOutput`. */
function projectWithRunners({ unitReport = ALL_PASSED, bddReport = "", typeOutput = "" }: { unitReport?: unknown; bddReport?: string | null; typeOutput?: string } = {}): void {
  writeMinimalConfig({ commands: COMMANDS, paths: PATHS });
  write("canned.ndjson", bddReport ?? "");
  write("unit-runner.mjs", `import { writeFileSync } from "node:fs";\nconst out = process.argv.find((arg) => arg.startsWith("--outputFile=")).slice("--outputFile=".length);\nwriteFileSync(out, ${JSON.stringify(JSON.stringify(unitReport))});\nprocess.exit(${JSON.stringify(unitReport) === JSON.stringify(ALL_PASSED) ? 0 : 1});\n`);
  write("bdd-runner.mjs", `import { copyFileSync, writeFileSync } from "node:fs";\nconst out = process.argv.find((arg) => arg.startsWith("message:")).slice("message:".length);\nif (${bddReport !== null}) copyFileSync("canned.ndjson", out);\nwriteFileSync(${JSON.stringify(BDD_RAN)}, "");\n`);
  write("tsc-runner.mjs", `process.stdout.write(${JSON.stringify(typeOutput)});\nprocess.exit(${typeOutput === "" ? 0 : 2});\n`);
}

describe("oid verify green", () => {
  it("accepts a project with no problem: exit 0, ok, and a checkpoint of the verified step with the feature in focus", async () => {
    projectWithRunners();
    writeProgressFile({ current_focus: "FR-A-01", features: [{ id: "FR-A-01", title: "A", status: "in_progress", cycle_step: "tdd_green", scenarios: [] }] });
    commitAll();
    write("src/a.ts", "export const a = 1;\n");
    expect(await runInProject(["verify", "green"])).toEqual({ exitCode: 0, stdout: "green: ok\n", stderr: "" });
    expect(JSON.parse(readFileSync(join(dir, ".outside-in/checkpoint.json"), "utf8"))).toMatchObject({
      step: "tdd_green",
      feature: "FR-A-01",
      verify: { kind: "green" },
      external: false,
      snapshot: { "src/a.ts": expect.any(String) },
    });
    expect(existsSync(join(dir, BDD_RAN))).toBe(false);
  });

  it("rejects a failing unit test: exit 1, the count of problems, the test and the first line of its failure, and no checkpoint", async () => {
    const failing = { fullName: "adds", title: "adds", status: "failed", failureMessages: ["AssertionError: expected 3 to be 4\n    at x"] };
    projectWithRunners({ unitReport: { testResults: [{ name: `${dir}/tests/unit/a.test.ts`, message: "", assertionResults: [failing] }] } });
    commitAll();
    expect(await runInProject(["verify", "green"])).toEqual({
      exitCode: 1,
      stdout: "green: 1 problem(s)\nunit tests/unit/a.test.ts > adds: AssertionError: expected 3 to be 4\n",
      stderr: "",
    });
    expect(existsSync(join(dir, ".outside-in/checkpoint.json"))).toBe(false);
  });

  it("rejects a type error in a source file and ignores one elsewhere", async () => {
    projectWithRunners({ typeOutput: "src/a.ts(2,3): error TS2322: Type 'number' is not assignable to type 'string'.\ntests/unit/a.test.ts(1,1): error TS2304: Cannot find name 'x'.\n" });
    commitAll();
    expect(await runInProject(["verify", "green"])).toEqual({
      exitCode: 1,
      stdout: "green: 1 problem(s)\ntype src/a.ts:2 TS2322 Type 'number' is not assignable to type 'string'.\n",
      stderr: "",
    });
  });

  it("runs the scenarios recorded as passing, found by their feature tag and name, and rejects those that no longer pass", async () => {
    const failed = { uri: "features/a.feature", name: "Adds", steps: [{ text: "it adds", status: "FAILED", message: "AssertionError: 3 !== 4\n    at x" }] };
    projectWithRunners({ bddReport: runMessages([failed]) });
    write("features/a.feature", "@FR-A-01\nFeature: A\n\n  Scenario: Adds\n    Given it adds\n");
    writeProgressFile({ current_focus: "FR-A-01", features: [{ id: "FR-A-01", title: "A", status: "in_progress", cycle_step: "tdd_green", scenarios: [{ name: "Adds", bdd: "pass" }] }] });
    commitAll();
    expect(await runInProject(["verify", "green"])).toEqual({
      exitCode: 1,
      stdout: "green: 1 problem(s)\nbdd features/a.feature:4 Adds: it adds (AssertionError: 3 !== 4)\n",
      stderr: "",
    });
  });

  it("names a scenario recorded as passing that no scenario tagged with its feature has the name of, and does not run the scenarios for it", async () => {
    projectWithRunners();
    write("features/a.feature", "@FR-A-01\nFeature: A\n\n  Scenario: Adds\n    Given it adds\n");
    writeProgressFile({ current_focus: null, features: [{ id: "FR-A-02", title: "B", status: "done", scenarios: [{ name: "Adds", bdd: "pass" }] }] });
    commitAll();
    expect(await runInProject(["verify", "green"])).toEqual({
      exitCode: 1,
      stdout: "green: 1 problem(s)\nbdd FR-A-02 Adds: no scenario of that name is tagged with the feature\n",
      stderr: "",
    });
    expect(existsSync(join(dir, BDD_RAN))).toBe(false);
  });

  it("rejects a scenario run that wrote no report, with the exit code of the runner", async () => {
    projectWithRunners({ bddReport: null });
    write("features/a.feature", "@FR-A-01\nFeature: A\n\n  Scenario: Adds\n    Given it adds\n");
    writeProgressFile({ current_focus: null, features: [{ id: "FR-A-01", title: "A", status: "done", scenarios: [{ name: "Adds", bdd: "pass" }] }] });
    commitAll();
    expect(await runInProject(["verify", "green"])).toEqual({
      exitCode: 1,
      stdout: "green: 1 problem(s)\nbdd: the runner wrote no report (exit 0)\n",
      stderr: "",
    });
  });

  it("rejects a unit run that wrote no report, with the exit code of the runner", async () => {
    projectWithRunners();
    write("unit-runner.mjs", "process.exit(4);\n");
    commitAll();
    expect(await runInProject(["verify", "green"])).toEqual({
      exitCode: 1,
      stdout: "green: 1 problem(s)\nunit: the runner wrote no report (exit 4)\n",
      stderr: "",
    });
  });

  it("rejects a type check that failed without printing an error", async () => {
    projectWithRunners();
    write("tsc-runner.mjs", "process.exit(127);\n");
    commitAll();
    expect(await runInProject(["verify", "green"])).toEqual({
      exitCode: 1,
      stdout: "green: 1 problem(s)\ntype: the type check failed (exit 127) and printed no error\n",
      stderr: "",
    });
  });

  it("rejects a step file that statically imports something that does not exist yet, without running the scenarios", async () => {
    projectWithRunners();
    write("features/a.feature", "@FR-A-01\nFeature: A\n\n  Scenario: Adds\n    Given it adds\n");
    writeProgressFile({ current_focus: null, features: [{ id: "FR-A-01", title: "A", status: "done", scenarios: [{ name: "Adds", bdd: "pass" }] }] });
    commitAll();
    write("features/steps/a.steps.ts", 'import { add } from "../../src/add.js";\n');
    expect(await runInProject(["verify", "green"])).toEqual({
      exitCode: 1,
      stdout: 'green: 1 problem(s)\nfeatures/steps/a.steps.ts:1 imports add from "../../src/add.js", which does not exist yet: import it dynamically inside the step\n',
      stderr: "",
    });
    expect(existsSync(join(dir, BDD_RAN))).toBe(false);
  });
});
