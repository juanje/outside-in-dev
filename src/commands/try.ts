import type { CliIo } from "../cli-io.js";
import { unrunSteps } from "../artifacts/cucumber-report.js";
import { NEWLINE } from "../artifacts/lines.js";
import { ProgressError } from "../artifacts/progress.js";
import { type Failure, FAILURE } from "../artifacts/red-classification.js";
import { ESLINT, lintErrors, lintInvocation, recognisedTool } from "../artifacts/lint-tools.js";
import type { ProjectConfig } from "../artifacts/project-config.js";
import { changedCodeFiles } from "../artifacts/try-files.js";
import { typeErrors } from "../artifacts/tsc-report.js";
import { loadVerifyConfig } from "../artifacts/verified-checkpoint.js";
import { CommandTimeoutError, type Runners } from "../artifacts/verify-runner.js";
import { TARGET } from "../artifacts/verify-target.js";
import { observeReport, observeUnitRun, parseTarget, type Target, trimFailure } from "./verify.js";

/** What `oid try` takes from the process: the runners that run the project's tools. */
export type TryServices = { runners: Runners };

/** What one check printed and whether it passed (a skipped check passes). */
type Check = { lines: string[]; ok: boolean };

/** Runs the unit test or the scenario the target names and says what the run showed. */
function observed(cwd: string, config: ProjectConfig, parsed: Target, runners: Runners): { failure: Failure; stderr: string } {
  if (parsed.kind === TARGET.test) {
    const run = runners.tryUnitTest(cwd, config.commands.unit, parsed.test);
    return { failure: observeUnitRun(cwd, run, parsed.test).failure, stderr: run.stderr };
  }
  const { exitCode, report, stderr } = runners.tryBddScenario(cwd, config.commands.bdd, parsed.scenario, false);
  return { failure: report === undefined ? { kind: FAILURE.noReport, runner: "BDD", exitCode } : observeReport(report, parsed.scenario, undefined), stderr };
}

/** The lines of a text, indented as the details of a check are. */
function indented(text: string): string[] {
  return text.split(NEWLINE).filter((line) => line !== "").map((line) => `  ${line}`);
}

/** The check of the test: what the run of it showed, in a line and the lines that explain it; a runner that wrote no report shows what it printed on stderr. */
function testCheck({ failure, stderr }: { failure: Failure; stderr: string }): Check {
  if (failure.kind === FAILURE.passed) return { lines: ["test: passed"], ok: true };
  if (failure.kind === FAILURE.noReport) return { lines: [`test: failed: the ${failure.runner} runner wrote no report (exit ${failure.exitCode})`, ...indented(stderr)], ok: false };
  if (failure.kind === FAILURE.noTest) return { lines: [`test: failed: no test named "${failure.name}" in ${failure.file}`], ok: false };
  if (failure.kind === FAILURE.load) return { lines: ["test: failed: the test file did not load", `  ${trimFailure(failure.message)}`], ok: false };
  if (failure.kind === FAILURE.notRun && failure.steps !== undefined) return { lines: [`test: undefined steps (${failure.steps.length})`, ...failure.steps.map((step) => `  ${step}`)], ok: false };
  const detail = failure.kind === FAILURE.error ? [`  ${trimFailure(failure.message)}`] : [];
  const at = failure.kind === FAILURE.error && failure.step !== undefined ? ` at ${failure.step}` : "";
  return { lines: [`test: failed${at}`, ...detail], ok: false };
}

/** The most items of a check that are listed; the others are counted. */
const MAX_LISTED = 10;

/** The items as details of a check, one line each: the first `MAX_LISTED`, and a line that counts the others. */
function listed(items: string[]): string[] {
  const shown = items.slice(0, MAX_LISTED).map((item) => `  ${item}`);
  return items.length > MAX_LISTED ? [...shown, `  ... ${items.length - MAX_LISTED} more`] : shown;
}

/** `1 error`, `2 errors`. */
function errorCount(count: number): string {
  return count === 1 ? "1 error" : `${count} errors`;
}

/** `1 file`, `2 files`. */
function fileCount(count: number): string {
  return count === 1 ? "1 file" : `${count} files`;
}

/** The check of the type check: its errors, one line each, with the file and line, the code and the message. */
function typesCheck(cwd: string, { exitCode, output }: { exitCode: number | null; output: string }): Check {
  if (exitCode === 0) return { lines: ["types: ok"], ok: true };
  const errors = typeErrors(output, cwd);
  return { lines: [`types: failed (${errorCount(errors.length)})`, ...listed(errors.map(({ file, line, code, message }) => `${file}:${line} ${code} ${message}`))], ok: false };
}

/** The problems a failed linter printed, one for each line: the errors of ESLint's JSON report with their file, line and rule; what any other linter, or an ESLint that printed no report, printed. */
function printedProblems(cwd: string, command: string, stdout: string): string[] {
  const lines = stdout.split(NEWLINE).filter((line) => line !== "");
  if (recognisedTool(cwd, command) !== ESLINT) return lines;
  try {
    return lintErrors(stdout, cwd).map(({ file, line, code, message }) => `${file}:${line} ${code} ${message}`);
  } catch {
    return lines;
  }
}

/** The check of the linter on the files changed since the last checkpoint: skipped when the project has none or nothing changed; otherwise its exit code, and what it printed when it fails. */
function lintCheck(cwd: string, config: ProjectConfig, runners: Runners): Check {
  const command = config.commands.lint;
  if (command === null) return { lines: ["lint: skipped (commands.lint is null)"], ok: true };
  const { source, shared, unit_tests, bdd_steps } = config.paths;
  const files = changedCodeFiles(cwd, [...source, ...shared, ...unit_tests, ...bdd_steps]);
  if (files.length === 0) return { lines: ["lint: skipped (no file changed since the last checkpoint)"], ok: true };
  const { exitCode, stdout } = runners.command(cwd, lintInvocation(cwd, command, files));
  if (exitCode === 0) return { lines: [`lint: ok (${fileCount(files.length)})`], ok: true };
  return { lines: [`lint: failed (${fileCount(files.length)})`, ...listed(printedProblems(cwd, command, stdout))], ok: false };
}

/** The option that only lists the undefined steps of a scenario. */
const DRY_RUN = "--dry-run";

/** The check of a dry run of the scenario: the steps the BDD runner found with no definition. */
function dryRunChecks(cwd: string, config: ProjectConfig, scenario: { file: string; line: number }, runners: Runners): Check[] {
  const { report } = runners.tryBddScenario(cwd, config.commands.bdd, scenario, true);
  const steps = unrunSteps(report!);
  return [steps.length === 0 ? { lines: ["dry-run: ok (no undefined step)"], ok: true } : { lines: [`dry-run: undefined steps (${steps.length})`, ...steps.map((step) => `  ${step}`)], ok: false }];
}

/** Prints the lines of the checks; the exit code is 0 when all of them passed, 1 otherwise. */
function print(io: CliIo, checks: Check[]): number {
  io.stdout(checks.flatMap(({ lines }) => lines).join(NEWLINE) + NEWLINE);
  return checks.every(({ ok }) => ok) ? 0 : 1;
}

/** Runs one unit test or one scenario with the project's runner, then the type check and the linter on the changed files, and prints a short verdict; nothing is recorded. Exit 0 when everything passes, 1 otherwise, and when a command does not end within its limit. */
export function runTry(io: CliIo, args: string[], runners: Runners): number {
  try {
    return tried(io, args, runners);
  } catch (error) {
    if (!(error instanceof CommandTimeoutError)) throw error;
    io.stdout(`try: failed: ${error.message}${NEWLINE}`);
    return 1;
  }
}

/** The checks of the target, printed. */
function tried(io: CliIo, args: string[], runners: Runners): number {
  const target = args.find((arg) => arg !== DRY_RUN);
  if (target === undefined) throw new ProgressError(`missing test or scenario: oid try "<test file> > <test name>" | <feature file>:<line> | "<scenario name>" [${DRY_RUN}]`);
  const config = loadVerifyConfig(io.cwd);
  const parsed = parseTarget(io.cwd, target);
  if (args.includes(DRY_RUN) && parsed.kind === TARGET.test) throw new ProgressError(`${DRY_RUN} lists the undefined steps of a scenario; ${target} is a unit test`);
  if (args.includes(DRY_RUN) && parsed.kind === TARGET.scenario) return print(io, dryRunChecks(io.cwd, config, parsed.scenario, runners));
  const checks = [testCheck(observed(io.cwd, config, parsed, runners)), typesCheck(io.cwd, runners.typecheck(io.cwd, config.commands.typecheck)), lintCheck(io.cwd, config, runners)];
  return print(io, [...checks, { lines: [checks.every(({ ok }) => ok) ? "try: ok" : "try: failed"], ok: true }]);
}
