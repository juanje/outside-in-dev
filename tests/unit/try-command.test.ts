import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CommandAbortedError, CommandTimeoutError, REAL_RUNNERS, type Runners } from "../../src/artifacts/verify-runner.js";
import { runTry } from "../../src/commands/try.js";
import { commitAll, git } from "./git-fixture.js";
import { printedParts } from "./rejection-fixture.js";
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
    tryTypecheck: () => answers.types ?? { exitCode: 0, output: "" },
    tryCommand: () => {
      throw new Error("no command was expected");
    },
  };
}

/** Runs `oid try` with the arguments in the temporary project and returns what it printed and its exit code. */
async function tryWith(args: string[], runners: Runners): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const exitCode = await runTry({ cwd: dir, stdout: (text) => (stdout += text), stderr: (text) => (stderr += text) }, args, runners);
  return { exitCode, stdout, stderr };
}

const TEST = "tests/a.test.ts > adds up";

/** What `oid try` prints when a check of the unit test fails: the checks as the evidence, and the fix to make. */
function failedTry(...checks: string[]): string {
  return printedParts("try: failed", checks.join("\n"), "fix what failed, then run the same oid try command again");
}

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
    tryCommand: (_cwd, commandLine) => {
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
  it("prints one line for each check and ends with the verdict when the test passes, the types are right and there is no linter", async () => {
    writeMinimalConfig();
    const { exitCode, stdout } = await tryWith([TEST], runnersAnswering({ unit: { exitCode: 0, report: unitReport("passed") } }));
    expect(stdout).toBe("test: passed\ntypes: ok\nlint: skipped (commands.lint is null)\ntry: ok\n");
    expect(exitCode).toBe(0);
  });

  it("says that no test has the name when the run found none, and that the test file did not load when it did not", async () => {
    writeMinimalConfig();
    const none = { testResults: [{ name: `${dir}/tests/a.test.ts`, status: "passed", message: "", assertionResults: [{ title: "other", fullName: "other", ancestorTitles: [], status: "skipped", failureMessages: [] }] }] };
    expect((await tryWith([TEST], runnersAnswering({ unit: { exitCode: 0, report: none } }))).stdout).toContain('\n  test: failed: no test named "adds up" in tests/a.test.ts\n  types: ok\n');
    const unloaded = { testResults: [{ name: `${dir}/tests/a.test.ts`, status: "failed", message: "Cannot find module '../src/a.js'\n    at somewhere", assertionResults: [] }] };
    expect((await tryWith([TEST], runnersAnswering({ unit: { exitCode: 1, report: unloaded } }))).stdout).toContain("\n  test: failed: the test file did not load\n    Cannot find module '../src/a.js'\n  types: ok\n");
  });

  it("says that the runner wrote no report, with its exit code and what it printed on stderr", async () => {
    writeMinimalConfig();
    const { exitCode, stdout } = await tryWith([TEST], runnersAnswering({ unit: { exitCode: 2, report: undefined, stderr: "vitest: command not found\nsecond line\n" } }));
    expect(stdout).toContain("\n  test: failed: the unit runner wrote no report (exit 2)\n    vitest: command not found\n    second line\n  types: ok\n");
    expect(exitCode).toBe(1);
  });

  it("shows the failure message of a test that fails up to its first stack frame, and ends with a failed verdict", async () => {
    writeMinimalConfig();
    const message = "AssertionError: expected 1 to be 2 // Object.is equality\n    at /somewhere/a.test.ts:4:9\n    at runTest (/node_modules/vitest/runner.js:1:1)";
    const { exitCode, stdout } = await tryWith([TEST], runnersAnswering({ unit: { exitCode: 1, report: unitReport("failed", [message]) } }));
    expect(stdout).toBe(failedTry("test: failed", "  AssertionError: expected 1 to be 2 // Object.is equality", "types: ok", "lint: skipped (commands.lint is null)"));
    expect(exitCode).toBe(1);
  });

  it("lists the type errors with their file, line and code, and counts them", async () => {
    writeMinimalConfig();
    const output = "src/a.ts(3,5): error TS2322: Type 'string' is not assignable to type 'number'.\nsrc/b.ts(9,1): error TS2304: Cannot find name 'x'.\n";
    const { exitCode, stdout } = await tryWith([TEST], runnersAnswering({ unit: { exitCode: 0, report: unitReport("passed") }, types: { exitCode: 2, output } }));
    expect(stdout).toBe(
      failedTry("test: passed", "types: failed (2 errors)", "  src/a.ts:3 TS2322 Type 'string' is not assignable to type 'number'.", "  src/b.ts:9 TS2304 Cannot find name 'x'.", "lint: skipped (commands.lint is null)"),
    );
    expect(exitCode).toBe(1);
  });

  it("refuses a call without a target, and a dry run of a unit test, as usage errors", async () => {
    writeMinimalConfig();
    const runners = runnersAnswering({});
    await expect(tryWith([], runners)).rejects.toThrow(/^missing test or scenario: oid try /);
    await expect(tryWith([TEST, "--dry-run"], runners)).rejects.toThrow("--dry-run lists the undefined steps of a scenario; tests/a.test.ts > adds up is a unit test");
  });

  it("ends with a failed verdict that names the command and the limit when a command does not end", async () => {
    writeMinimalConfig();
    const runners: Runners = { ...runnersAnswering({}), tryUnitTest: () => { throw new CommandTimeoutError("u", 1); } };
    const { exitCode, stdout } = await tryWith([TEST], runners);
    expect(stdout).toBe(
      printedParts(
        'try: failed: the command "u" did not end within 1 s and was stopped; raise limits.command_timeout_s in .outside-in.json if it needs more time',
        `target: ${TEST}`,
        `run a smaller target or fix what keeps the command from ending (a test that never ends, a watch mode), then run the same oid try command again`,
      ),
    );
    expect(exitCode).toBe(1);
  });

  it("lists at most ten type errors and counts the others", async () => {
    writeMinimalConfig();
    const output = Array.from({ length: 12 }, (_, index) => `src/a.ts(${index + 1},1): error TS2322: Wrong ${index + 1}.\n`).join("");
    const { stdout } = await tryWith([TEST], runnersAnswering({ unit: { exitCode: 0, report: unitReport("passed") }, types: { exitCode: 2, output } }));
    const listed = stdout.split("\n").filter((line) => line.startsWith("    "));
    expect(stdout).toContain("\n  types: failed (12 errors)\n");
    expect(listed).toHaveLength(11);
    expect(listed[9]).toBe("    src/a.ts:10 TS2322 Wrong 10.");
    expect(listed[10]).toBe("    ... 2 more");
  });

  it("runs the linter only on the changed files, and shows what a linter oid does not recognise printed when it fails", async () => {
    projectWithChangedFiles();
    const asked: string[] = [];
    const { exitCode, stdout } = await tryWith([TEST], lintingWith({ exitCode: 1, stdout: "problem in src/a.ts\nproblem in src/c.ts\n" }, asked));
    expect(asked).toEqual(["mylint 'src/a.ts' 'src/c.ts'"]);
    expect(stdout).toBe(failedTry("test: passed", "types: ok", "lint: failed (2 files)", "  problem in src/a.ts", "  problem in src/c.ts"));
    expect(exitCode).toBe(1);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("lists the errors ESLint reports, one line each with the file, line and rule, instead of its JSON", async () => {
    projectWithChangedFiles("eslint");
    const asked: string[] = [];
    const report = [{ filePath: join(dir, "src/a.ts"), messages: [{ ruleId: "no-unused-vars", severity: 2, message: "'x' is unused", line: 3 }, { ruleId: "semi", severity: 1, message: "warning only", line: 4 }] }];
    const { exitCode, stdout } = await tryWith([TEST], lintingWith({ exitCode: 1, stdout: JSON.stringify(report) }, asked));
    expect(asked).toEqual(["eslint --format json 'src/a.ts' 'src/c.ts'"]);
    expect(stdout).toContain("\n  lint: failed (2 files)\n    src/a.ts:3 no-unused-vars 'x' is unused\nNext: ");
    expect(exitCode).toBe(1);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("skips the linter, and says so, when no file changed since the last checkpoint", async () => {
    projectWithChangedFiles();
    git("add", "-A");
    git("commit", "--quiet", "--message", "everything");
    const asked: string[] = [];
    const { exitCode, stdout } = await tryWith([TEST], lintingWith({ exitCode: 1, stdout: "" }, asked));
    expect(asked).toEqual([]);
    expect(stdout).toBe("test: passed\ntypes: ok\nlint: skipped (no file changed since the last checkpoint)\ntry: ok\n");
    expect(exitCode).toBe(0);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("says how many files the linter checked when it passes", async () => {
    projectWithChangedFiles();
    const { exitCode, stdout } = await tryWith([TEST], lintingWith({ exitCode: 0, stdout: "" }, []));
    expect(stdout).toBe("test: passed\ntypes: ok\nlint: ok (2 files)\ntry: ok\n");
    expect(exitCode).toBe(0);
  }, REAL_PROCESS_TIMEOUT_MS);
});

describe("oid try with a scenario", () => {
  it("lists the steps that have no definition, with their location and text, in place of a verdict on the test", async () => {
    writeMinimalConfig();
    write("features/greeting.feature", GREETING_FEATURE);
    const { exitCode, stdout } = await tryWith(["features/greeting.feature:12"], runnersReplaying("try-bdd-undefined", 1));
    expect(stdout).toBe(
      printedParts(
        "try: failed",
        "test: undefined steps (1)\n  features/greeting.feature:14 When it is printed (UNDEFINED)\ntypes: ok\nlint: skipped (commands.lint is null)",
        "fix what failed, then run the same oid try command again",
      ),
    );
    expect(exitCode).toBe(1);
  });

  it("names the step that failed and shows its message up to the first stack frame", async () => {
    writeMinimalConfig();
    write("features/greeting.feature", GREETING_FEATURE);
    const { exitCode, stdout } = await tryWith(["features/greeting.feature:8"], runnersReplaying("try-bdd-fail", 1));
    expect(stdout.split("\n").slice(0, 5)).toEqual(["try: failed", "Evidence:", "  test: failed at features/greeting.feature:10 Then it is shouted", "    AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:", "    + actual - expected"]);
    expect(stdout).not.toContain("    at ");
    expect(exitCode).toBe(1);
  });

  it("lists only the undefined steps of the scenario in a dry run, which runs neither the type check nor the linter", async () => {
    writeMinimalConfig();
    write("features/greeting.feature", GREETING_FEATURE);
    const asked: boolean[] = [];
    const runners: Runners = { ...runnersReplaying("try-bdd-dry-undefined", 0), tryBddScenario: (...call) => (asked.push(call[3]), runnersReplaying("try-bdd-dry-undefined", 0).tryBddScenario(...call)), tryTypecheck: () => { throw new Error("no type check was expected"); } };
    const { exitCode, stdout } = await tryWith(["--dry-run", "features/greeting.feature:12"], runners);
    expect(stdout).toBe(
      printedParts(
        "try: failed",
        "dry-run: undefined steps (1)\n  features/greeting.feature:14 When it is printed (UNDEFINED)",
        "define the undefined steps in a step file, then run the same oid try command again",
      ),
    );
    expect(asked).toEqual([true]);
    expect(exitCode).toBe(1);
  });
});

describe("oid try runs without blocking the process", () => {
  it("lets the event loop run while a check is under way: a timer fires before the verdict is printed", async () => {
    writeMinimalConfig();
    const order: string[] = [];
    const slow: Runners = {
      ...runnersAnswering({}),
      tryUnitTest: () => new Promise((done) => setTimeout(() => done({ exitCode: 0, report: unitReport("passed"), stderr: "" }), 300)),
    };
    setTimeout(() => order.push("timer"), 50);
    const { exitCode } = await tryWith([TEST], slow);
    order.push("verdict");
    expect({ order, exitCode }).toEqual({ order: ["timer", "verdict"], exitCode: 0 });
  });

  it("hands the signal it is given to every runner it calls", async () => {
    writeMinimalConfig();
    const controller = new AbortController();
    const seen: Array<AbortSignal | undefined> = [];
    const runners: Runners = {
      ...runnersAnswering({}),
      tryUnitTest: (_cwd, _command, _test, control) => (seen.push(control?.signal), { exitCode: 0, report: unitReport("passed"), stderr: "" }),
      tryTypecheck: (_cwd, _command, control) => (seen.push(control?.signal), { exitCode: 0, output: "" }),
    };
    let stdout = "";
    await runTry({ cwd: dir, stdout: (text) => (stdout += text), stderr: () => {} }, [TEST], runners, { signal: controller.signal });
    expect(seen).toEqual([controller.signal, controller.signal]);
  });

  it("does not turn the stop of a command into a verdict: the error of a command that was aborted reaches the caller", async () => {
    writeMinimalConfig();
    const runners: Runners = { ...runnersAnswering({}), tryUnitTest: () => { throw new CommandAbortedError("u"); } };
    await expect(tryWith([TEST], runners)).rejects.toBeInstanceOf(CommandAbortedError);
  });

  it("runs a command of the project without blocking, and stops it with its group when the signal is aborted", async () => {
    const controller = new AbortController();
    const running = REAL_RUNNERS.tryCommand(dir, "sleep 30", { signal: controller.signal });
    setTimeout(() => controller.abort(), 100);
    await expect(running).rejects.toBeInstanceOf(CommandAbortedError);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("answers a command of the project with its exit code and what it printed", async () => {
    expect(await REAL_RUNNERS.tryCommand(dir, "echo hi")).toEqual({ exitCode: 0, stdout: "hi\n", stderr: "" });
  }, REAL_PROCESS_TIMEOUT_MS);
});
