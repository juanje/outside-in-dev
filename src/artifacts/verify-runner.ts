import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSupervised } from "./command-supervisor.js";
import { ProgressError } from "./progress.js";
import { CONFIG_FILE, loadCommandTimeoutS } from "./project-config.js";
import { readJson, readText } from "./project-json.js";
import { UNIT_SEPARATOR, WORD_SEPARATOR } from "./verify-target.js";

/** The directory, relative to the project, that holds the runners' reports; local and git-ignored. */
const REPORT_DIR = ".outside-in/verify";
export const UNIT_REPORT = `${REPORT_DIR}/unit.json`;
/** The glob of oid's own directory, which every unit run excludes so the copies of tests that checkpoints keep are never run as tests. */
const OID_DIR_GLOB = "**/.outside-in/**";
export const BDD_REPORT = `${REPORT_DIR}/bdd.ndjson`;

/** The text quoted for a POSIX shell as one word. */
export function shellQuote(text: string): string {
  return `'${text.replaceAll("'", "'\\''")}'`;
}

/** The text with the characters a regular expression gives a meaning escaped, so it matches itself. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The options oid appends to every unit command: the exclusion of its own directory, and the report options with the file the report is written to. */
function reportOptions(reportPath: string): string {
  return `--exclude=${shellQuote(OID_DIR_GLOB)} --reporter=json --outputFile=${shellQuote(reportPath)}`;
}

/** The configured unit command with oid's arguments appended: the test file, the test name as the `--testNamePattern=` filter, in one word so a name starting with `-` is not read as an option and the JSON report. */
export function unitRunCommand(command: string, test: { file: string; name: string }, reportPath: string): string {
  const filter = test.name.split(UNIT_SEPARATOR).join(WORD_SEPARATOR);
  return `${command} ${shellQuote(test.file)} --testNamePattern=${shellQuote(escapeRegExp(filter))} ${reportOptions(reportPath)}`;
}

/** The configured BDD command with oid's arguments appended: the location of each scenario and the Cucumber Messages report. */
function bddScenariosCommand(command: string, scenarios: { file: string; line: number }[], reportPath: string): string {
  const locations = scenarios.map(({ file, line }) => ` ${shellQuote(`${file}:${line}`)}`).join("");
  return `${command}${locations} --format message:${shellQuote(reportPath)}`;
}

/** The configured BDD command with oid's arguments appended: the location of the scenario and the Cucumber Messages report. */
export function bddRunCommand(command: string, scenario: { file: string; line: number }, reportPath: string): string {
  return bddScenariosCommand(command, [scenario], reportPath);
}

/** The configured BDD command with oid's arguments appended to list the undefined steps of a scenario without running it: its location, the dry run option and the Cucumber Messages report. */
export function bddDryRunCommand(command: string, scenario: { file: string; line: number }, reportPath: string): string {
  return `${command} ${shellQuote(`${scenario.file}:${scenario.line}`)} --dry-run --format message:${shellQuote(reportPath)}`;
}

/** How long the processes of a command that passed its limit have to end after SIGTERM before they are killed. */
const STOP_GRACE_MS = 2000;
const MS_PER_SECOND = 1000;

/** A command that passed `limits.command_timeout_s` and was stopped, with every process it started. */
export class CommandTimeoutError extends ProgressError {
  constructor(commandLine: string, seconds: number) {
    super(`the command "${commandLine}" did not end within ${seconds} s and was stopped; raise limits.command_timeout_s in ${CONFIG_FILE} if it needs more time`);
  }
}

/** Makes ready for a run that writes `reportPath`: the directory of the reports exists and the report of an earlier run is gone. Every runner that writes a report in the project does it, so a runner that answers without a process leaves the same files; the type check, the other commands and the runs of `oid try` write nothing there. */
export function clearReport(cwd: string, reportPath?: string): void {
  mkdirSync(join(cwd, REPORT_DIR), { recursive: true });
  if (reportPath !== undefined) rmSync(join(cwd, reportPath), { force: true });
}

/** Runs a command line through the shell in the project and writes nothing of its own; returns its exit code and what it printed; throws when it does not end within `limits.command_timeout_s`. */
export function runTimed(cwd: string, commandLine: string): { exitCode: number | null; stdout: string; stderr: string } {
  const seconds = loadCommandTimeoutS(cwd);
  const { status, stdout, stderr, timedOut } = runSupervised(cwd, commandLine, { timeoutMs: seconds * MS_PER_SECOND, graceMs: STOP_GRACE_MS });
  if (timedOut) throw new CommandTimeoutError(commandLine, seconds);
  return { exitCode: status, stdout, stderr };
}

/** Runs a command line through the shell in the project, after clearing the report it will write, if any; returns its exit code and what it printed; throws when it does not end within `limits.command_timeout_s`. */
function runWriting(cwd: string, commandLine: string, reportPath?: string): { exitCode: number | null; stdout: string; stderr: string } {
  clearReport(cwd, reportPath);
  return runTimed(cwd, commandLine);
}

/** Runs a command line through the shell in the project and returns its exit code and what it printed. */
export function runCommand(cwd: string, commandLine: string): { exitCode: number | null; stdout: string; stderr: string } {
  return runTimed(cwd, commandLine);
}

/** Runs the configured unit command for one test in the project and returns its exit code and the JSON report it wrote, if any. */
export function runUnitTest(cwd: string, command: string, test: { file: string; name: string }): { exitCode: number | null; report: unknown } {
  const { exitCode } = runWriting(cwd, unitRunCommand(command, test, UNIT_REPORT), UNIT_REPORT);
  return { exitCode, report: readJson(cwd, UNIT_REPORT) };
}

/** Runs `use` with the path of a report file in a directory of its own, outside the project, which is removed afterwards. */
function withTempReport<T>(name: string, use: (reportPath: string) => T): T {
  const directory = mkdtempSync(join(tmpdir(), "oid-try-"));
  try {
    return use(join(directory, name));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** The text of a report file, if the runner wrote it. */
function readReport(reportPath: string): string | undefined {
  return existsSync(reportPath) ? readFileSync(reportPath, "utf8") : undefined;
}

/** Runs the configured unit command for one test, as `oid try` does: the report goes to a directory outside the project, so nothing is written in it. Returns the exit code, the JSON report the runner wrote, if any, and its stderr. */
export function tryUnitTest(cwd: string, command: string, test: { file: string; name: string }): { exitCode: number | null; report: unknown; stderr: string } {
  return withTempReport("unit.json", (reportPath) => {
    const { exitCode, stderr } = runTimed(cwd, unitRunCommand(command, test, reportPath));
    const text = readReport(reportPath);
    return { exitCode, report: text === undefined ? undefined : (JSON.parse(text) as unknown), stderr };
  });
}

/** Runs the configured BDD command for one scenario, as `oid try` does, or only its dry run (the steps without definition, no step run): the report goes to a directory outside the project, so nothing is written in it. Returns the exit code, the Cucumber Messages report the runner wrote, if any, and its stderr. */
export function tryBddScenario(cwd: string, command: string, scenario: { file: string; line: number }, dryRun: boolean): { exitCode: number | null; report: string | undefined; stderr: string } {
  return withTempReport("bdd.ndjson", (reportPath) => {
    const commandLine = dryRun ? bddDryRunCommand(command, scenario, reportPath) : bddRunCommand(command, scenario, reportPath);
    const { exitCode, stderr } = runTimed(cwd, commandLine);
    return { exitCode, report: readReport(reportPath), stderr };
  });
}

/** Runs the configured unit command for the whole suite in the project and returns its exit code and the JSON report it wrote, if any. */
export function runUnitSuite(cwd: string, command: string): { exitCode: number | null; report: unknown } {
  const { exitCode } = runWriting(cwd, `${command} ${reportOptions(UNIT_REPORT)}`, UNIT_REPORT);
  return { exitCode, report: readJson(cwd, UNIT_REPORT) };
}

/** Runs the configured BDD command for some scenarios in the project and returns its exit code, the Cucumber Messages report it wrote, if any, and its stderr. */
export function runBddScenarios(cwd: string, command: string, scenarios: { file: string; line: number }[]): { exitCode: number | null; report: string | undefined; stderr: string } {
  const { exitCode, stderr } = runWriting(cwd, bddScenariosCommand(command, scenarios, BDD_REPORT), BDD_REPORT);
  return { exitCode, report: readText(cwd, BDD_REPORT), stderr };
}

/** Runs the configured BDD command for every scenario of the project and returns its exit code and the Cucumber Messages report it wrote, if any. */
export function runBddSuite(cwd: string, command: string): { exitCode: number | null; report: string | undefined } {
  const { exitCode, report } = runBddScenarios(cwd, command, []);
  return { exitCode, report };
}

/** Runs the configured BDD command for one scenario in the project and returns its exit code, the Cucumber Messages report it wrote, if any, and its stderr. */
export function runBddScenario(cwd: string, command: string, scenario: { file: string; line: number }): { exitCode: number | null; report: string | undefined; stderr: string } {
  return runBddScenarios(cwd, command, [scenario]);
}

/** Runs the configured type check with the plain output option in the project and returns its exit code and what it printed on stdout, where `tsc` lists the errors. */
export function runTypecheck(cwd: string, command: string): { exitCode: number | null; output: string } {
  const { exitCode, stdout } = runTimed(cwd, `${command} --pretty false`);
  return { exitCode, output: stdout };
}

/** How a run executes the project's tools: the unit suite, some BDD scenarios (all of them when the list is empty), the type check and any other command. `oid run` takes it as a service, so that a caller can answer the calls without a process; `REAL_RUNNERS` is the default, which runs each one through the shell. */
export type Runners = {
  unitSuite(cwd: string, command: string): { exitCode: number | null; report: unknown };
  bddScenarios(cwd: string, command: string, scenarios: { file: string; line: number }[]): { exitCode: number | null; report: string | undefined; stderr: string };
  typecheck(cwd: string, command: string): { exitCode: number | null; output: string };
  command(cwd: string, commandLine: string): { exitCode: number | null; stdout: string; stderr: string };
  /** One unit test, for `oid try`: nothing is written in the project. */
  tryUnitTest(cwd: string, command: string, test: { file: string; name: string }): { exitCode: number | null; report: unknown; stderr: string };
  /** One scenario, or only its dry run, for `oid try`: nothing is written in the project. */
  tryBddScenario(cwd: string, command: string, scenario: { file: string; line: number }, dryRun: boolean): { exitCode: number | null; report: string | undefined; stderr: string };
};

/** The runners that start a process for each call, under the command timeout. */
export const REAL_RUNNERS: Runners = { unitSuite: runUnitSuite, bddScenarios: runBddScenarios, typecheck: runTypecheck, command: runCommand, tryUnitTest, tryBddScenario };
