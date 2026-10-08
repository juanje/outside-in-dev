import { NEWLINE } from "../artifacts/lines.js";
import { failedScenarios } from "../artifacts/cucumber-report.js";
import { newErrors } from "../artifacts/gate-errors.js";
import { type GateError, recognisedTool, TOOL_MODE, toolInvocation } from "../artifacts/lint-tools.js";
import type { ProjectConfig } from "../artifacts/project-config.js";
import { checkViolations } from "../commands/check.js";
import { SUITE, suiteProblems } from "../commands/verify-green.js";
import { lintReport, typeReport } from "./gate-reports.js";
import { runBddSuite, runCommand } from "../artifacts/verify-runner.js";

/** What a run's baseline holds of the quality gate: the identity of the lint errors and type errors the project already had, and the traceability violations. */
export type GateBaseline = { lint: string[]; types: string[]; traceability: string[] };

/** What the checks of the quality gate came to: they pass, errors of the linter or the type check go to an agent to fix, or a check failed that a person has to look at (its name, one line for each problem and the whole output). */
export const OUTCOME = { ok: "ok", internal: "internal", fix: "fix", ask: "ask" } as const;
export type GateOutcome = { kind: typeof OUTCOME.ok } | { kind: typeof OUTCOME.internal; problem: string } | { kind: typeof OUTCOME.fix; errors: GateError[]; output: string } | { kind: typeof OUTCOME.ask; check: string; problems: string[]; output: string };

const PASS: GateOutcome = { kind: OUTCOME.ok };
const FORMAT = "format";
const TRACEABILITY = "traceability";
const LINT = "lint";
const COVERAGE = "coverage";
const EXTRA_CHECK = "extra check";

/** The outcome for the errors a check found that the baseline does not hold: a fix, or a pass when there are none. */
function fixOrPass(errors: GateError[], output: string): GateOutcome {
  return errors.length === 0 ? PASS : { kind: OUTCOME.fix, errors, output: output.trimEnd() };
}

/** The lint check: the errors ESLint reports that the baseline does not hold; the exit code of a linter oid does not recognise. */
function lintOutcome(worktree: string, command: string, held: Set<string>): GateOutcome {
  const report = lintReport(worktree, command);
  return report === undefined ? commandOutcome(LINT, worktree, command) : fixOrPass(newErrors(worktree, report.errors, held), report.output);
}

/** The traceability violations `oid check` reports that the baseline does not hold. */
function traceabilityProblems(worktree: string, held: Set<string>): string[] {
  return checkViolations(worktree).map(({ message }) => message).filter((message) => !held.has(message));
}

/** The format check: after the fixes Prettier must find nothing to format, or oid itself is wrong; a formatter oid does not recognise is judged by its exit code. */
function formatOutcome(worktree: string, command: string): GateOutcome {
  if (recognisedTool(worktree, command) !== "prettier") return commandOutcome(FORMAT, worktree, command);
  const { exitCode, stdout } = runCommand(worktree, toolInvocation(worktree, command, TOOL_MODE.check));
  return exitCode === 0 ? PASS : { kind: OUTCOME.internal, problem: `the formatter still finds files to format after its fixes:${NEWLINE}${stdout.trim()}` };
}

/** The type check: the errors of the whole project that the baseline does not hold. */
function typesOutcome(worktree: string, command: string, held: Set<string>): GateOutcome {
  const { errors, output } = typeReport(worktree, command);
  return fixOrPass(newErrors(worktree, errors, held), output);
}

/** The problems of the BDD suite of the whole project: each scenario that did not pass, a report that is missing, and an exit that the report does not explain. */
function bddProblems(worktree: string, command: string): string[] {
  const { exitCode, report } = runBddSuite(worktree, command);
  if (report === undefined) return [`${SUITE.bdd}: the runner wrote no report (exit ${exitCode})`];
  const failed = failedScenarios(report);
  return failed.length === 0 && exitCode !== 0 ? [`${SUITE.bdd}: the runner exited ${exitCode} but its report names no failing scenario`] : failed;
}

/** The outcome for the problems of a check that a person has to look at: nothing to ask when there are none. */
function askOrPass(check: string, problems: string[]): GateOutcome {
  return problems.length === 0 ? PASS : { kind: OUTCOME.ask, check, problems, output: problems.join(NEWLINE) };
}

/** The outcome of a command of the project that passes with exit code 0: a failure is put to a person with the command, its exit code and what it printed. */
function commandOutcome(check: string, worktree: string, command: string): GateOutcome {
  const { exitCode, stdout, stderr } = runCommand(worktree, command);
  const output = `${stdout}${stderr}`.trim();
  return exitCode === 0 ? PASS : { kind: OUTCOME.ask, check, problems: [`"${command}" exited ${exitCode}`, ...output.split(NEWLINE)], output };
}

/** The outcome of the first of some commands that fails. */
function firstFailure(check: string, worktree: string, commands: string[]): GateOutcome {
  for (const command of commands) {
    const outcome = commandOutcome(check, worktree, command);
    if (outcome !== PASS) return outcome;
  }
  return PASS;
}

/** Runs the checks of the quality gate, cheapest first, and returns what the first that fails came to. */
export function gateChecks(worktree: string, config: ProjectConfig, baseline: GateBaseline): GateOutcome {
  const { format, lint, typecheck, coverage, extra_checks: extra } = config.commands;
  const checks = [
    () => (format === null ? PASS : formatOutcome(worktree, format)),
    () => askOrPass(TRACEABILITY, traceabilityProblems(worktree, new Set(baseline.traceability))),
    () => (lint === null ? PASS : lintOutcome(worktree, lint, new Set(baseline.lint))),
    () => typesOutcome(worktree, typecheck, new Set(baseline.types)),
    () => askOrPass(SUITE.unit, suiteProblems(worktree, config)),
    () => askOrPass(SUITE.bdd, bddProblems(worktree, config.commands.bdd)),
    () => firstFailure(COVERAGE, worktree, coverage === null ? [] : [coverage]),
    () => firstFailure(EXTRA_CHECK, worktree, extra),
  ];
  for (const check of checks) {
    const outcome = check();
    if (outcome !== PASS) return outcome;
  }
  return PASS;
}
