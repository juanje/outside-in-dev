import { existsSync } from "node:fs";
import { join } from "node:path";
import { bddProblems } from "../artifacts/cucumber-report.js";
import { NEWLINE } from "../artifacts/lines.js";
import { loadableStepsProblems } from "../artifacts/loadable-steps.js";
import { locatePassingScenarios } from "../artifacts/passing-scenarios.js";
import { loadProgress } from "../artifacts/progress.js";
import type { ProjectConfig } from "../artifacts/project-config.js";
import { isInsideSource } from "../artifacts/source-roots.js";
import { listLocatedScenarios, readFeatureSources } from "../artifacts/traceability.js";
import { typeProblems } from "../artifacts/tsc-report.js";
import { loadVerifyConfig, recordVerified } from "../artifacts/verified-checkpoint.js";
import { runBddScenarios, runTypecheck, runUnitSuite } from "../artifacts/verify-runner.js";
import { normalizeVitestReport, unitProblems } from "../artifacts/vitest-report.js";
import type { CliIo } from "../cli-io.js";

export const GREEN = "green";

/** The problem of a runner that did not write the report oid reads. */
function noReport(kind: string, exitCode: number | null): string {
  return `${kind}: the runner wrote no report (exit ${exitCode})`;
}

/** The problems of the unit suite: each test that failed, each file that did not load, or the report that is missing. */
function suiteProblems(cwd: string, config: ProjectConfig): string[] {
  const { exitCode, report } = runUnitSuite(cwd, config.commands.unit);
  return report === undefined ? [noReport("unit", exitCode)] : unitProblems(normalizeVitestReport(report), cwd);
}

/** The problems of the type check: each error located in a source file or in no file, or a failure that printed no error. */
function typecheckProblems(cwd: string, config: ProjectConfig): string[] {
  const { exitCode, output } = runTypecheck(cwd, config.commands.typecheck);
  const problems = typeProblems(output, cwd, (path) => isInsideSource(config.paths.source, path));
  return exitCode !== 0 && output.trim() === "" ? [`type: the type check failed (exit ${exitCode}) and printed no error`] : problems;
}

/** The problems of the scenarios that progress records as passing: those that no longer pass and those that no longer exist. */
function scenarioProblems(cwd: string, config: ProjectConfig): string[] {
  if (!existsSync(join(cwd, config.paths.progress))) return [];
  const located = listLocatedScenarios(readFeatureSources(cwd, config.paths.bdd_features));
  const { found, missing } = locatePassingScenarios(loadProgress(cwd, config.paths.progress), located);
  const gone = missing.map(({ feature, name }) => `bdd ${feature} ${name}: no scenario of that name is tagged with the feature`);
  if (found.length === 0) return gone;
  const unloadable = loadableStepsProblems(cwd, config);
  if (unloadable.length > 0) return [...unloadable, ...gone];
  const { exitCode, report } = runBddScenarios(cwd, config.commands.bdd, found);
  return [...(report === undefined ? [noReport("bdd", exitCode)] : bddProblems(report, found)), ...gone];
}

/** Runs the unit suite, the scenarios that were passing and the type check, and says whether the Green has regressions: exit 0 when it has none, 1 when it has. */
export function runGreen(io: CliIo): number {
  const config = loadVerifyConfig(io.cwd);
  const problems = [
    ...suiteProblems(io.cwd, config),
    ...scenarioProblems(io.cwd, config),
    ...typecheckProblems(io.cwd, config),
  ];
  if (problems.length > 0) {
    io.stdout(`green: ${problems.length} problem(s)${NEWLINE}${problems.join(NEWLINE)}${NEWLINE}`);
    return 1;
  }
  recordVerified(io.cwd, config, { step: "tdd_green", verify: { kind: GREEN, target: "all" }, external: false });
  io.stdout(`green: ok${NEWLINE}`);
  return 0;
}
