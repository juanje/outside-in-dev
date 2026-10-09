import { ProgressError } from "../artifacts/progress.js";
import { failedScenarios } from "../artifacts/cucumber-report.js";
import { FAILING, incoherentExit, noReport, SUITE } from "../artifacts/runner-verdict.js";
import { REAL_RUNNERS, type Runners } from "../artifacts/verify-runner.js";
import { normalizeVitestReport, unitProblems } from "../artifacts/vitest-report.js";

/** What failed in the suite, one line for each unit test and each scenario, and for each runner that failed with a report that names no failure (empty when the runners passed), and the reports the runners wrote. */
export type SuiteResult = { unit: string[]; bdd: string[]; reports: { unit: string; bdd: string } };

/** The problems of a runner: what its report names as failed, or, when it names none, the exit that says it failed all the same. */
function explained(kind: string, exitCode: number | null, failures: string[], what: string): string[] {
  return failures.length === 0 && exitCode !== 0 ? [incoherentExit(kind, exitCode, what)] : failures;
}

/** Runs the unit and BDD commands of the project and reads their structured reports, never what they print. A runner that wrote no report is an error. */
export function runSuite(cwd: string, commands: { unit: string; bdd: string }, runners: Runners = REAL_RUNNERS): SuiteResult {
  const unit = runners.unitSuite(cwd, commands.unit);
  const bdd = runners.bddScenarios(cwd, commands.bdd, []);
  if (unit.report === undefined) throw new ProgressError(noReport(SUITE.unit, unit.exitCode));
  if (bdd.report === undefined) throw new ProgressError(noReport(SUITE.bdd, bdd.exitCode));
  return {
    unit: explained(SUITE.unit, unit.exitCode, unitProblems(normalizeVitestReport(unit.report), cwd), FAILING.unit),
    bdd: explained(SUITE.bdd, bdd.exitCode, failedScenarios(bdd.report), FAILING.bdd),
    reports: { unit: JSON.stringify(unit.report), bdd: bdd.report },
  };
}
