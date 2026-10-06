import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { readJson } from "./project-json.js";

/** The directory, relative to the project, that holds the runners' reports; local and git-ignored. */
const REPORT_DIR = ".outside-in/verify";
const UNIT_REPORT = `${REPORT_DIR}/unit.json`;

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

/** Runs the configured unit command for one test in the project and returns its exit code and the JSON report it wrote, if any. */
export function runUnitTest(cwd: string, command: string, test: { file: string; name: string }): { exitCode: number | null; report: unknown } {
  mkdirSync(join(cwd, REPORT_DIR), { recursive: true });
  rmSync(join(cwd, UNIT_REPORT), { force: true });
  const { status } = spawnSync(unitRunCommand(command, test, UNIT_REPORT), { cwd, shell: true, stdio: "ignore" });
  return { exitCode: status, report: readJson(cwd, UNIT_REPORT) };
}
