import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CommandTimeoutError, REAL_RUNNERS, type Runners } from "../../src/artifacts/verify-runner.js";
import { runTry } from "../../src/commands/try.js";
import { commitAll, git } from "./git-fixture.js";
import { dir, REAL_PROCESS_TIMEOUT_MS, useTempDir, write, writeMinimalConfig } from "./temp-project.js";

useTempDir();

/** A vitest JSON report of one file holding one test with the given status and failure messages. */
function unitReport(status: string, failureMessages: string[] = []): unknown {
  return { testResults: [{ name: `${dir}/tests/a.test.ts`, status, message: "", assertionResults: [{ title: "adds up", fullName: "adds up", ancestorTitles: [], status, failureMessages }] }] };
}

/** The runners of a test: the unit test and the type check answer as given, and any other call fails the test. */
function runnersAnswering(answers: { unit?: { exitCode: number | null; report: unknown; stderr?: string }; types?: { exitCode: number | null; output: string } }): Runners {
  return {
    ...REAL_RUNNERS,
    tryUnitTest: () => ({ stderr: "", ...answers.unit! }),
    typecheck: () => answers.types ?? { exitCode: 0, output: "" },
    command: () => {
      throw new Error("no command was expected");
    },
  };
}

/** Runs `oid try` with the arguments in the temporary project and returns what it printed and its exit code. */
function tryWith(args: string[], runners: Runners): { exitCode: number; stdout: string; stderr: string } {
  let stdout = "";
  let stderr = "";
  const exitCode = runTry({ cwd: dir, stdout: (text) => (stdout += text), stderr: (text) => (stderr += text) }, args, runners);
  return { exitCode, stdout, stderr };
}

const TEST = "tests/a.test.ts > adds up";

const RECORDED = join(import.meta.dirname, "../../features/support/recorded");
/** The feature the recorded reports of `oid try` ran, written at the place they name. */
const GREETING_FEATURE = [
  "@FR-GREETING-01",
  "Feature: Greeting",
  "",
  "  Scenario: Greet Ann politely",
  "    Given the greeting for Ann",
  "    Then it is polite",
  "",
  "  Scenario: Greet Ann loudly",
  "    Given the greeting for Ann",
  "    Then it is shouted",
  "",
  "  Scenario: Greet Ann in writing",
  "    Given the greeting for Ann",
  "    When it is printed",
  "    Then it is polite",
  "",
].join("\n");

/** The runners of a test that answer the scenario with a recorded report. */
function runnersReplaying(recording: string, exitCode: number): Runners {
  return {
    ...runnersAnswering({}),
    tryBddScenario: () => ({ exitCode, report: readFileSync(join(RECORDED, `${recording}.ndjson`), "utf8"), stderr: "" }),
  };
}

/** The runners of a test with a linter: the command it is given is kept in `asked`, and answered. */
function lintingWith(answer: { exitCode: number | null; stdout: string }, asked: string[]): Runners {
  return {
    ...runnersAnswering({ unit: { exitCode: 0, report: unitReport("passed") } }),
    command: (_cwd, commandLine) => {
      asked.push(commandLine);
      return { stderr: "", ...answer };
    },
  };
}

/** A git project with a linter configured, where `src/a.ts` is modified and `src/c.ts` is new since HEAD. */
function projectWithChangedFiles(lint = "mylint"): void {
  writeMinimalConfig({ commands: { bdd: "b", unit: "u", typecheck: "t", format: null, lint, coverage: null, extra_checks: [] } });
  write("src/a.ts", "export const a = 1;\n");
  write("src/b.ts", "export const b = 1;\n");
  write(".gitignore", ".outside-in\n");
  commitAll();
  write("src/a.ts", "export const a = 2;\n");
  write("src/c.ts", "export const c = 1;\n");
}

describe("oid try with a unit test", () => {
  it("prints one line for each check and ends with the verdict when the test passes, the types are right and there is no linter", () => {
    writeMinimalConfig();
    const { exitCode, stdout } = tryWith([TEST], runnersAnswering({ unit: { exitCode: 0, report: unitReport("passed") } }));
    expect(stdout).toBe("test: passed\ntypes: ok\nlint: skipped (commands.lint is null)\ntry: ok\n");
    expect(exitCode).toBe(0);
  });

  it("says that no test has the name when the run found none, and that the test file did not load when it did not", () => {
    writeMinimalConfig();
    const none = { testResults: [{ name: `${dir}/tests/a.test.ts`, status: "passed", message: "", assertionResults: [{ title: "other", fullName: "other", ancestorTitles: [], status: "skipped", failureMessages: [] }] }] };
    expect(tryWith([TEST], runnersAnswering({ unit: { exitCode: 0, report: none } })).stdout).toContain('test: failed: no test named "adds up" in tests/a.test.ts\ntypes: ok\n');
    const unloaded = { testResults: [{ name: `${dir}/tests/a.test.ts`, status: "failed", message: "Cannot find module '../src/a.js'\n    at somewhere", assertionResults: [] }] };
    expect(tryWith([TEST], runnersAnswering({ unit: { exitCode: 1, report: unloaded } })).stdout).toContain("test: failed: the test file did not load\n  Cannot find module '../src/a.js'\ntypes: ok\n");
  });

  it("says that the runner wrote no report, with its exit code and what it printed on stderr", () => {
    writeMinimalConfig();
    const { exitCode, stdout } = tryWith([TEST], runnersAnswering({ unit: { exitCode: 2, report: undefined, stderr: "vitest: command not found\nsecond line\n" } }));
    expect(stdout).toContain("test: failed: the unit runner wrote no report (exit 2)\n  vitest: command not found\n  second line\ntypes: ok\n");
    expect(exitCode).toBe(1);
  });

  it("shows the failure message of a test that fails up to its first stack frame, and ends with a failed verdict", () => {
    writeMinimalConfig();
    const message = "AssertionError: expected 1 to be 2 // Object.is equality\n    at /somewhere/a.test.ts:4:9\n    at runTest (/node_modules/vitest/runner.js:1:1)";
    const { exitCode, stdout } = tryWith([TEST], runnersAnswering({ unit: { exitCode: 1, report: unitReport("failed", [message]) } }));
    expect(stdout).toBe("test: failed\n  AssertionError: expected 1 to be 2 // Object.is equality\ntypes: ok\nlint: skipped (commands.lint is null)\ntry: failed\n");
    expect(exitCode).toBe(1);
  });

  it("lists the type errors with their file, line and code, and counts them", () => {
    writeMinimalConfig();
    const output = "src/a.ts(3,5): error TS2322: Type 'string' is not assignable to type 'number'.\nsrc/b.ts(9,1): error TS2304: Cannot find name 'x'.\n";
    const { exitCode, stdout } = tryWith([TEST], runnersAnswering({ unit: { exitCode: 0, report: unitReport("passed") }, types: { exitCode: 2, output } }));
    expect(stdout).toBe(
      "test: passed\ntypes: failed (2 errors)\n  src/a.ts:3 TS2322 Type 'string' is not assignable to type 'number'.\n  src/b.ts:9 TS2304 Cannot find name 'x'.\nlint: skipped (commands.lint is null)\ntry: failed\n",
    );
    expect(exitCode).toBe(1);
  });

  it("refuses a call without a target, and a dry run of a unit test, as usage errors", () => {
    writeMinimalConfig();
    const runners = runnersAnswering({});
    expect(() => tryWith([], runners)).toThrow(/^missing test or scenario: oid try /);
    expect(() => tryWith([TEST, "--dry-run"], runners)).toThrow("--dry-run lists the undefined steps of a scenario; tests/a.test.ts > adds up is a unit test");
  });

  it("ends with a failed verdict that names the command and the limit when a command does not end", () => {
    writeMinimalConfig();
    const runners: Runners = { ...runnersAnswering({}), tryUnitTest: () => { throw new CommandTimeoutError("u", 1); } };
    const { exitCode, stdout } = tryWith([TEST], runners);
    expect(stdout).toBe('try: failed: the command "u" did not end within 1 s and was stopped; raise limits.command_timeout_s in .outside-in.json if it needs more time\n');
    expect(exitCode).toBe(1);
  });

  it("lists at most ten type errors and counts the others", () => {
    writeMinimalConfig();
    const output = Array.from({ length: 12 }, (_, index) => `src/a.ts(${index + 1},1): error TS2322: Wrong ${index + 1}.\n`).join("");
    const { stdout } = tryWith([TEST], runnersAnswering({ unit: { exitCode: 0, report: unitReport("passed") }, types: { exitCode: 2, output } }));
    const listed = stdout.split("\n").filter((line) => line.startsWith("  "));
    expect(stdout).toContain("types: failed (12 errors)\n");
    expect(listed).toHaveLength(11);
    expect(listed[9]).toBe("  src/a.ts:10 TS2322 Wrong 10.");
    expect(listed[10]).toBe("  ... 2 more");
  });

  it("runs the linter only on the changed files, and shows what a linter oid does not recognise printed when it fails", () => {
    projectWithChangedFiles();
    const asked: string[] = [];
    const { exitCode, stdout } = tryWith([TEST], lintingWith({ exitCode: 1, stdout: "problem in src/a.ts\nproblem in src/c.ts\n" }, asked));
    expect(asked).toEqual(["mylint 'src/a.ts' 'src/c.ts'"]);
    expect(stdout).toBe("test: passed\ntypes: ok\nlint: failed (2 files)\n  problem in src/a.ts\n  problem in src/c.ts\ntry: failed\n");
    expect(exitCode).toBe(1);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("lists the errors ESLint reports, one line each with the file, line and rule, instead of its JSON", () => {
    projectWithChangedFiles("eslint");
    const asked: string[] = [];
    const report = [{ filePath: join(dir, "src/a.ts"), messages: [{ ruleId: "no-unused-vars", severity: 2, message: "'x' is unused", line: 3 }, { ruleId: "semi", severity: 1, message: "warning only", line: 4 }] }];
    const { exitCode, stdout } = tryWith([TEST], lintingWith({ exitCode: 1, stdout: JSON.stringify(report) }, asked));
    expect(asked).toEqual(["eslint --format json 'src/a.ts' 'src/c.ts'"]);
    expect(stdout).toContain("lint: failed (2 files)\n  src/a.ts:3 no-unused-vars 'x' is unused\ntry: failed\n");
    expect(exitCode).toBe(1);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("skips the linter, and says so, when no file changed since the last checkpoint", () => {
    projectWithChangedFiles();
    git("add", "-A");
    git("commit", "--quiet", "--message", "everything");
    const asked: string[] = [];
    const { exitCode, stdout } = tryWith([TEST], lintingWith({ exitCode: 1, stdout: "" }, asked));
    expect(asked).toEqual([]);
    expect(stdout).toBe("test: passed\ntypes: ok\nlint: skipped (no file changed since the last checkpoint)\ntry: ok\n");
    expect(exitCode).toBe(0);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("says how many files the linter checked when it passes", () => {
    projectWithChangedFiles();
    const { exitCode, stdout } = tryWith([TEST], lintingWith({ exitCode: 0, stdout: "" }, []));
    expect(stdout).toBe("test: passed\ntypes: ok\nlint: ok (2 files)\ntry: ok\n");
    expect(exitCode).toBe(0);
  }, REAL_PROCESS_TIMEOUT_MS);
});

describe("oid try with a scenario", () => {
  it("lists the steps that have no definition, with their location and text, in place of a verdict on the test", () => {
    writeMinimalConfig();
    write("features/greeting.feature", GREETING_FEATURE);
    const { exitCode, stdout } = tryWith(["features/greeting.feature:12"], runnersReplaying("try-bdd-undefined", 1));
    expect(stdout).toBe("test: undefined steps (1)\n  features/greeting.feature:14 When it is printed (UNDEFINED)\ntypes: ok\nlint: skipped (commands.lint is null)\ntry: failed\n");
    expect(exitCode).toBe(1);
  });

  it("names the step that failed and shows its message up to the first stack frame", () => {
    writeMinimalConfig();
    write("features/greeting.feature", GREETING_FEATURE);
    const { exitCode, stdout } = tryWith(["features/greeting.feature:8"], runnersReplaying("try-bdd-fail", 1));
    expect(stdout.split("\n").slice(0, 3)).toEqual(["test: failed at features/greeting.feature:10 Then it is shouted", "  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:", "  + actual - expected"]);
    expect(stdout).not.toContain("    at ");
    expect(exitCode).toBe(1);
  });

  it("lists only the undefined steps of the scenario in a dry run, which runs neither the type check nor the linter", () => {
    writeMinimalConfig();
    write("features/greeting.feature", GREETING_FEATURE);
    const asked: boolean[] = [];
    const runners: Runners = { ...runnersReplaying("try-bdd-dry-undefined", 0), tryBddScenario: (...call) => (asked.push(call[3]), runnersReplaying("try-bdd-dry-undefined", 0).tryBddScenario(...call)), typecheck: () => { throw new Error("no type check was expected"); } };
    const { exitCode, stdout } = tryWith(["--dry-run", "features/greeting.feature:12"], runners);
    expect(stdout).toBe("dry-run: undefined steps (1)\n  features/greeting.feature:14 When it is printed (UNDEFINED)\n");
    expect(asked).toEqual([true]);
    expect(exitCode).toBe(1);
  });
});
