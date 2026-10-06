import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { readJson, readText } from "./project-json.js";

/** The directory, relative to the project, that holds the runners' reports; local and git-ignored. */
const REPORT_DIR = ".outside-in/verify";
const UNIT_REPORT = `${REPORT_DIR}/unit.json`;
const BDD_REPORT = `${REPORT_DIR}/bdd.ndjson`;

/** The text quoted for a POSIX shell as one word. */
function shellQuote(text: string): string {
  return `'${text.replaceAll("'", "'\\''")}'`;
}

/** The text with the characters a regular expression gives a meaning escaped, so it matches itself. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The report options of the unit command, and the file the report is written to. */
function reportOptions(reportPath: string): string {
  return `--reporter=json --outputFile=${shellQuote(reportPath)}`;
}

/** The configured unit command with oid's arguments appended: the test file, the test name as the `-t` filter and the JSON report. */
export function unitRunCommand(command: string, test: { file: string; name: string }, reportPath: string): string {
  return `${command} ${shellQuote(test.file)} -t ${shellQuote(escapeRegExp(test.name))} ${reportOptions(reportPath)}`;
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

/** Runs a command line through the shell in the project, after clearing the report it will write, if any; returns its exit code and what it printed. */
function runWriting(cwd: string, commandLine: string, reportPath?: string): { exitCode: number | null; stdout: string; stderr: string } {
  mkdirSync(join(cwd, REPORT_DIR), { recursive: true });
  if (reportPath !== undefined) rmSync(join(cwd, reportPath), { force: true });
  const { status, stdout, stderr } = spawnSync(commandLine, { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"], maxBuffer: Infinity });
  return { exitCode: status, stdout: stdout.toString(), stderr: stderr.toString() };
}

/** Runs the configured unit command for one test in the project and returns its exit code and the JSON report it wrote, if any. */
export function runUnitTest(cwd: string, command: string, test: { file: string; name: string }): { exitCode: number | null; report: unknown } {
  const { exitCode } = runWriting(cwd, unitRunCommand(command, test, UNIT_REPORT), UNIT_REPORT);
  return { exitCode, report: readJson(cwd, UNIT_REPORT) };
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

/** Runs the configured BDD command for one scenario in the project and returns its exit code, the Cucumber Messages report it wrote, if any, and its stderr. */
export function runBddScenario(cwd: string, command: string, scenario: { file: string; line: number }): { exitCode: number | null; report: string | undefined; stderr: string } {
  return runBddScenarios(cwd, command, [scenario]);
}

/** Runs the configured type check with the plain output option in the project and returns its exit code and what it printed on stdout, where `tsc` lists the errors. */
export function runTypecheck(cwd: string, command: string): { exitCode: number | null; output: string } {
  const { exitCode, stdout } = runWriting(cwd, `${command} --pretty false`);
  return { exitCode, output: stdout };
}
