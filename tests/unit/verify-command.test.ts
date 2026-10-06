import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commitAll } from "./git-fixture.js";
import { runInProject } from "./run-capture.js";
import { dir, useTempDir, write, writeMinimalConfig, writeProgressFile } from "./temp-project.js";

useTempDir();

const TARGET = "tests/unit/a.test.ts > adds";
const COMMANDS = { bdd: "b", unit: "node runner.mjs", typecheck: "t", format: null, lint: null, coverage: null, extra_checks: [] };

/** A project whose unit runner is a script that writes `report` where oid asks for it. */
function projectWithRunner(report: unknown): void {
  writeMinimalConfig({ commands: COMMANDS });
  write(
    "runner.mjs",
    `import { writeFileSync } from "node:fs";\nconst out = process.argv.find((arg) => arg.startsWith("--outputFile=")).slice("--outputFile=".length);\nwriteFileSync(out, ${JSON.stringify(JSON.stringify(report))});\n`,
  );
}

const passed = { fullName: "adds", title: "adds", status: "passed", failureMessages: [] };

function testFile(message: string, tests: unknown[]) {
  return { name: `${dir}/tests/unit/a.test.ts`, status: "failed", message, assertionResults: tests };
}

const assertionFailure = { fullName: "adds", title: "adds", status: "failed", failureMessages: ["AssertionError: expected 3 to be 4\n    at x"] };

describe("oid verify red", () => {
  it("rejects a test that passes: exit 1 and a first line naming the class and why", async () => {
    projectWithRunner({ testResults: [testFile("", [passed])] });
    expect(await runInProject(["verify", "red", TARGET])).toEqual({
      exitCode: 1,
      stdout: "red: not valid (test_bug): the test passes without new implementation\n",
      stderr: "",
    });
  });

  it("accepts a test of a source module that does not exist yet: exit 0 and a checkpoint of the verified step", async () => {
    projectWithRunner({ testResults: [testFile(`Cannot find module '../../src/nope.js' imported from '${dir}/tests/unit/a.test.ts'`, [])] });
    commitAll();
    write("tests/unit/a.test.ts", "// the test\n");
    expect(await runInProject(["verify", "red", TARGET])).toEqual({
      exitCode: 0,
      stdout: "red: valid (missing_implementation): the module ../../src/nope.js does not exist yet\n",
      stderr: "",
    });
    expect(JSON.parse(readFileSync(join(dir, ".outside-in/checkpoint.json"), "utf8"))).toMatchObject({
      step: "tdd_red",
      verify: { kind: "red", target: TARGET },
      external: false,
      snapshot: { "tests/unit/a.test.ts": expect.any(String) },
    });
  });

  it("asks for a decision on a failing assertion: exit 2, the trimmed failure, the questions and how to answer, and no checkpoint", async () => {
    const failing = { fullName: "adds", title: "adds", status: "failed", failureMessages: ["AssertionError: expected 3 to be 4 // Object.is equality\n    at /p/a.test.ts:3:45\n    at run (/p/x.js:1:1)"] };
    projectWithRunner({ testResults: [testFile("", [failing])] });
    commitAll();
    const { exitCode, stdout } = await runInProject(["verify", "red", TARGET]);
    expect({ exitCode, stdout }).toEqual({
      exitCode: 2,
      stdout: [
        "red: needs a decision",
        `test: ${TARGET}`,
        "failure: AssertionError: expected 3 to be 4 // Object.is equality",
        "reason: an assertion failed",
        "questions:",
        "  - Is this the assertion of the new behaviour, failing for the right reason?",
        "  - Does the test check something meaningful, not only toBeDefined and not only the absence of something?",
        `answer with: oid verify red "${TARGET}" --decide <class>`,
        "  business_assertion, missing_implementation: a valid Red (exit 0)",
        "  test_bug, environment: not a Red (exit 1)",
        "",
      ].join("\n"),
    });
    expect(existsSync(join(dir, ".outside-in/checkpoint.json"))).toBe(false);
  });

  it("asks only the question that fits an ambiguous failure that is not an assertion", async () => {
    const failing = { fullName: "adds", title: "adds", status: "failed", failureMessages: ["RangeError: Invalid count value: -1\n    at x"] };
    projectWithRunner({ testResults: [testFile("", [failing])] });
    commitAll();
    const { exitCode, stdout } = await runInProject(["verify", "red", TARGET]);
    expect(exitCode).toBe(2);
    expect(stdout.split("\n").slice(2, 8)).toEqual([
      "failure: RangeError: Invalid count value: -1",
      "reason: the test failed with an error that is not an assertion",
      "questions:",
      "  - Does this failure come from behaviour that does not exist yet, rather than from a mistake in the test or in the environment?",
      `answer with: oid verify red "${TARGET}" --decide <class>`,
      "  business_assertion, missing_implementation: a valid Red (exit 0)",
    ]);
  });

  it("takes the class given with --decide for a failure that needs a decision: a valid Red is recorded as an external decision", async () => {
    projectWithRunner({ testResults: [testFile("", [assertionFailure])] });
    commitAll();
    expect(await runInProject(["verify", "red", TARGET, "--decide", "business_assertion"])).toEqual({
      exitCode: 0,
      stdout: "red: valid (business_assertion): decided outside oid\n",
      stderr: "",
    });
    expect(JSON.parse(readFileSync(join(dir, ".outside-in/checkpoint.json"), "utf8"))).toMatchObject({ step: "tdd_red", external: true });
  });

  it("refuses --decide when the run does not need a decision, printing no verdict and recording nothing", async () => {
    projectWithRunner({ testResults: [testFile("", [passed])] });
    commitAll();
    expect(await runInProject(["verify", "red", TARGET, "--decide", "business_assertion"])).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "error: --decide is refused: this run does not need a decision (the test passes without new implementation)\n",
    });
    expect(existsSync(join(dir, ".outside-in/checkpoint.json"))).toBe(false);
  });

  it("refuses a decision that is not one of the four classes, naming them", async () => {
    projectWithRunner({ testResults: [testFile("", [assertionFailure])] });
    commitAll();
    expect(await runInProject(["verify", "red", TARGET, "--decide", "maybe"])).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "error: unknown decision maybe; valid decisions: business_assertion, missing_implementation, test_bug, environment\n",
    });
  });

  it("rejects a test name that no test of the file has", async () => {
    projectWithRunner({ testResults: [testFile("", [passed])] });
    expect(await runInProject(["verify", "red", "tests/unit/a.test.ts > greets nobody"])).toEqual({
      exitCode: 1,
      stdout: 'red: not valid (test_bug): no test named "greets nobody" ran in tests/unit/a.test.ts\n',
      stderr: "",
    });
  });

  it("asks for the full name when several tests share the given name", async () => {
    const formal = { fullName: "formal adds", title: "adds", status: "failed", failureMessages: ["x"] };
    const informal = { fullName: "informal adds", title: "adds", status: "failed", failureMessages: ["x"] };
    projectWithRunner({ testResults: [testFile("", [formal, informal])] });
    expect(await runInProject(["verify", "red", TARGET])).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: 'error: several tests are named "adds"; give the full name of one of them: formal adds, informal adds\n',
    });
  });

  it("treats a runner that writes no report as the environment, giving its exit code", async () => {
    writeMinimalConfig({ commands: { ...COMMANDS, unit: "node exit4.mjs" } });
    write("exit4.mjs", "process.exit(4);\n");
    expect(await runInProject(["verify", "red", TARGET])).toEqual({
      exitCode: 1,
      stdout: "red: not valid (environment): the unit runner wrote no report (exit code 4)\n",
      stderr: "",
    });
  });

  it("rejects a test that the runner skipped: it did not run, so it failed for nothing", async () => {
    projectWithRunner({ testResults: [testFile("", [{ ...passed, status: "skipped" }])] });
    expect(await runInProject(["verify", "red", TARGET])).toEqual({
      exitCode: 1,
      stdout: "red: not valid (test_bug): the test did not run (status skipped)\n",
      stderr: "",
    });
  });

  it("asks for oid init when the project has no configuration to take the unit command from", async () => {
    expect(await runInProject(["verify", "red", TARGET])).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "error: .outside-in.json not found: oid verify runs the commands it holds; run oid init first\n",
    });
  });

  it("names the valid subcommands when the subcommand is missing or unknown", async () => {
    const results = [await runInProject(["verify"]), await runInProject(["verify", "bogus"])];
    expect(results.map(({ exitCode, stderr }) => ({ exitCode, stderr }))).toEqual([
      { exitCode: 1, stderr: "error: missing subcommand; valid subcommands: red, green\n" },
      { exitCode: 1, stderr: "error: unknown subcommand bogus; valid subcommands: red, green\n" },
    ]);
  });

  it("asks for the test when none is given, and for the name when only a file is", async () => {
    const results = [await runInProject(["verify", "red"]), await runInProject(["verify", "red", "tests/unit/a.test.ts"])];
    expect(results.map(({ exitCode, stderr }) => ({ exitCode, stderr }))).toEqual([
      { exitCode: 1, stderr: 'error: missing test: oid verify red "<test file> > <test name>"\n' },
      { exitCode: 1, stderr: 'error: expected "<test file> > <test name>", got "tests/unit/a.test.ts"\n' },
    ]);
  });

  it("records the focused feature in the checkpoint, and none without a progress file", async () => {
    projectWithRunner({ testResults: [testFile(`Cannot find module '../../src/nope.js' imported from '${dir}/tests/unit/a.test.ts'`, [])] });
    commitAll();
    await runInProject(["verify", "red", TARGET]);
    const feature = () => JSON.parse(readFileSync(join(dir, ".outside-in/checkpoint.json"), "utf8")).feature;
    expect(feature()).toBeNull();
    writeProgressFile({ current_focus: "FR-X-01", features: [{ id: "FR-X-01", title: "Alpha", status: "in_progress", cycle_step: "tdd_red", scenarios: [] }] });
    await runInProject(["verify", "red", TARGET]);
    expect(feature()).toBe("FR-X-01");
  });
});
