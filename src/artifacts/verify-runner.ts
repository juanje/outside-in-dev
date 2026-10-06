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

/** The configured unit command with oid's arguments appended: the test file, the test name as the `-t` filter and the JSON report. */
export function unitRunCommand(command: string, test: { file: string; name: string }, reportPath: string): string {
  return `${command} ${shellQuote(test.file)} -t ${shellQuote(escapeRegExp(test.name))} --reporter=json --outputFile=${shellQuote(reportPath)}`;
}

/** The configured BDD command with oid's arguments appended: the location of the scenario and the Cucumber Messages report. */
export function bddRunCommand(command: string, scenario: { file: string; line: number }, reportPath: string): string {
  return `${command} ${shellQuote(`${scenario.file}:${scenario.line}`)} --format message:${shellQuote(reportPath)}`;
}

/** Runs a command line through the shell in the project, after clearing the report it will write; returns its exit code and what it printed on stderr. */
function runWriting(cwd: string, commandLine: string, reportPath: string): { exitCode: number | null; stderr: string } {
  mkdirSync(join(cwd, REPORT_DIR), { recursive: true });
  rmSync(join(cwd, reportPath), { force: true });
  const { status, stderr } = spawnSync(commandLine, { cwd, shell: true, stdio: ["ignore", "ignore", "pipe"] });
  return { exitCode: status, stderr: stderr.toString() };
}

/** Runs the configured unit command for one test in the project and returns its exit code and the JSON report it wrote, if any. */
export function runUnitTest(cwd: string, command: string, test: { file: string; name: string }): { exitCode: number | null; report: unknown } {
  const { exitCode } = runWriting(cwd, unitRunCommand(command, test, UNIT_REPORT), UNIT_REPORT);
  return { exitCode, report: readJson(cwd, UNIT_REPORT) };
}

/** Runs the configured BDD command for one scenario in the project and returns its exit code, the Cucumber Messages report it wrote, if any, and its stderr. */
export function runBddScenario(cwd: string, command: string, scenario: { file: string; line: number }): { exitCode: number | null; report: string | undefined; stderr: string } {
  const { exitCode, stderr } = runWriting(cwd, bddRunCommand(command, scenario, BDD_REPORT), BDD_REPORT);
  return { exitCode, report: readText(cwd, BDD_REPORT), stderr };
}
