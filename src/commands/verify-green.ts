import { existsSync } from "node:fs";
import { join } from "node:path";
import { bddProblems } from "../artifacts/cucumber-report.js";
import { NEWLINE } from "../artifacts/lines.js";
import { FAILURE } from "../artifacts/red-classification.js";
import { loadableStepsProblems } from "../artifacts/loadable-steps.js";
import { type FeatureScenarioLocation, locatePassingScenarios } from "../artifacts/passing-scenarios.js";
import type { EvidenceScenario } from "../artifacts/checkpoint.js";
import { parseBddTarget } from "../artifacts/verify-target.js";
import { loadProgress } from "../artifacts/progress.js";
import type { ProjectConfig } from "../artifacts/project-config.js";
import { isInsideSource } from "../artifacts/source-roots.js";
import { type LocatedScenario, listLocatedScenarios, readFeatureSources } from "../artifacts/traceability.js";
import { typeProblems } from "../artifacts/tsc-report.js";
import { loadVerifyConfig, recordVerified } from "../artifacts/verified-checkpoint.js";
import { runBddScenarios, runTypecheck, runUnitSuite } from "../artifacts/verify-runner.js";
import { normalizeVitestReport, unitProblems } from "../artifacts/vitest-report.js";
import type { CliIo } from "../cli-io.js";

export const GREEN = "green";

/** The names of the two suites in the problems a Green lists. */
const SUITE = { unit: "unit", bdd: "bdd" } as const;
/** The vitest status of a test that ran and passed. */
const TEST_PASSED = FAILURE.passed;

/** The problem of a runner that did not write the report oid reads. */
function noReport(kind: string, exitCode: number | null): string {
  return `${kind}: the runner wrote no report (exit ${exitCode})`;
}

/** The problem of a runner whose exit says it failed while its report names no failure: the report cannot be trusted as a Green. */
function incoherentExit(kind: string, exitCode: number | null, what: string): string {
  return `${kind}: the runner exited ${exitCode} but its report names no ${what}`;
}

/** The problems of the unit suite: each test that failed, each file that did not load, the report that is missing, a run in which no test ran, and an exit that the report does not explain. */
function suiteProblems(cwd: string, config: ProjectConfig): string[] {
  const { exitCode, report } = runUnitSuite(cwd, config.commands.unit);
  if (report === undefined) return [noReport(SUITE.unit, exitCode)];
  const files = normalizeVitestReport(report);
  const problems = unitProblems(files, cwd);
  if (problems.length > 0) return problems;
  if (!files.some(({ tests }) => tests.some(({ status }) => status === TEST_PASSED))) return [`${SUITE.unit}: no test ran (exit ${exitCode})`];
  return exitCode === 0 ? [] : [incoherentExit(SUITE.unit, exitCode, "failing test")];
}

/** The problems of the type check: each error located in a source file or in no file, or a failure that printed no error. */
function typecheckProblems(cwd: string, config: ProjectConfig): string[] {
  const { exitCode, output } = runTypecheck(cwd, config.commands.typecheck);
  const problems = typeProblems(output, cwd, (path) => isInsideSource(config.paths.source, path));
  return exitCode !== 0 && output.trim() === "" ? [`type: the type check failed (exit ${exitCode}) and printed no error`] : problems;
}

const FEATURE_TAG = /^@(FR-[A-Z][A-Z0-9]*-\d{2,3}[a-z]?)$/;

/** The scenarios the targets name, once for each feature tag of the scenario, and the problem of each target that is malformed, locates no scenario or locates one with no feature tag. */
function locateTargets(targets: string[], located: LocatedScenario[]): { found: FeatureScenarioLocation[]; problems: string[] } {
  const found: FeatureScenarioLocation[] = [];
  const problems: string[] = [];
  for (const target of targets) {
    const parsed = parseBddTarget(target);
    const match = parsed && located.find(({ file, line }) => file === parsed.file.replace(/^\.\//, "") && line === parsed.line);
    const features = match?.tags.flatMap((tag) => FEATURE_TAG.exec(tag)?.[1] ?? []) ?? [];
    if (parsed === undefined) problems.push(`target ${target}: expected <feature>:<line>`);
    else if (match === undefined) problems.push(`bdd ${target}: no scenario starts at that line`);
    else if (features.length === 0) problems.push(`bdd ${target}: the scenario is not tagged with a feature`);
    else found.push(...features.map((feature) => ({ feature, file: match.file, line: match.line, name: match.name })));
  }
  return { found, problems };
}

/** The scenarios of a list, each location once. */
function distinctLocations(scenarios: FeatureScenarioLocation[]): FeatureScenarioLocation[] {
  return scenarios.filter((scenario, at) => scenarios.findIndex(({ file, line }) => file === scenario.file && line === scenario.line) === at);
}

/** What the BDD run of the scenarios that progress records as passing and of the targets showed: its problems, the scenarios that ran and passed, and the features the targets are tagged with. */
function scenarioResult(cwd: string, config: ProjectConfig, targets: string[]): { problems: string[]; ran: EvidenceScenario[]; targeted: string[] } {
  const located = listLocatedScenarios(readFeatureSources(cwd, config.paths.bdd_features));
  const hasProgress = existsSync(join(cwd, config.paths.progress));
  const passing = hasProgress ? locatePassingScenarios(loadProgress(cwd, config.paths.progress), located) : { found: [], missing: [] };
  const gone = passing.missing.map(({ feature, name }) => `bdd ${feature} ${name}: no scenario of that name is tagged with the feature`);
  const named = locateTargets(targets, located);
  const problems = [...named.problems, ...gone];
  const found = [...passing.found, ...named.found];
  const targeted = named.found.map(({ feature }) => feature);
  if (found.length === 0) return { problems, ran: [], targeted };
  const unloadable = loadableStepsProblems(cwd, config);
  if (unloadable.length > 0) return { problems: [...unloadable, ...problems], ran: [], targeted };
  const toRun = distinctLocations(found);
  const { exitCode, report } = runBddScenarios(cwd, config.commands.bdd, toRun);
  if (report === undefined) return { problems: [noReport(SUITE.bdd, exitCode), ...problems], ran: [], targeted };
  const failing = bddProblems(report, toRun);
  const unexplained = failing.length === 0 && exitCode !== 0 ? [incoherentExit(SUITE.bdd, exitCode, "failing scenario")] : [];
  const ran = [...new Map(found.map(({ feature, name }) => [`${feature}\0${name}`, { feature, name }])).values()];
  return { problems: [...failing, ...unexplained, ...problems], ran, targeted };
}

/** Runs the unit suite, the scenarios that were passing, the scenarios named by `targets` and the type check, and says whether the Green has regressions: exit 0 when it has none, 1 when it has. A Green records the scenarios it ran as evidence, in the checkpoint of the feature in focus and of the feature of each target. */
export function runGreen(io: CliIo, targets: string[] = []): number {
  const config = loadVerifyConfig(io.cwd);
  const scenarios = scenarioResult(io.cwd, config, targets);
  const problems = [...suiteProblems(io.cwd, config), ...scenarios.problems, ...typecheckProblems(io.cwd, config)];
  if (problems.length > 0) {
    io.stdout(`green: ${problems.length} problem(s)${NEWLINE}${problems.join(NEWLINE)}${NEWLINE}`);
    return 1;
  }
  recordVerified(io.cwd, config, { step: "tdd_green", verify: { kind: GREEN, target: "all" }, external: false, scenarios: scenarios.ran }, scenarios.targeted);
  io.stdout(`green: ok${NEWLINE}`);
  return 0;
}
