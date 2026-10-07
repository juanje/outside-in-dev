import { ProgressError } from "../artifacts/progress.js";
import { failedScenarios } from "../artifacts/cucumber-report.js";
import { runBddSuite, runUnitSuite } from "../artifacts/verify-runner.js";
import { normalizeVitestReport, unitProblems } from "../artifacts/vitest-report.js";

/** What failed in the suite, one line for each unit test and each scenario (empty when the runner passed), and the reports the runners wrote. */
export type SuiteResult = { unit: string[]; bdd: string[]; reports: { unit: string; bdd: string } };

/** Runs the unit and BDD commands of the project and reads their structured reports, never what they print. */
export function runSuite(cwd: string, commands: { unit: string; bdd: string }): SuiteResult {
  const unit = runUnitSuite(cwd, commands.unit);
  const bdd = runBddSuite(cwd, commands.bdd);
  if (bdd.report === undefined) throw new ProgressError("the BDD runner wrote no report");
  return { unit: unitProblems(normalizeVitestReport(unit.report), cwd), bdd: failedScenarios(bdd.report), reports: { unit: JSON.stringify(unit.report), bdd: bdd.report } };
}
