import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { addedLines } from "../artifacts/added-lines.js";
import { failingFile, failingFrame, observeScenario, normalizeCucumberReport } from "../artifacts/cucumber-report.js";
import { changedSinceCheckpoint } from "../artifacts/checkpoint.js";
import { CYCLE_STEP, ProgressError } from "../artifacts/progress.js";
import { CONFIG_FILE, type ProjectConfig } from "../artifacts/project-config.js";
import { focusedFeature, loadVerifyConfig, recordVerified } from "../artifacts/verified-checkpoint.js";
import { loadableStepsProblems } from "../artifacts/loadable-steps.js";
import { resolveImportedSymbol } from "../artifacts/project-symbol.js";
import { observationToDecide, recordObservation } from "../artifacts/red-observation.js";
import { classifyFailure, FAILURE, type Failure, OUTCOME, RED_CLASS, type RedClass, type Verdict } from "../artifacts/red-classification.js";
import { readText } from "../artifacts/project-json.js";
import { isInsideSource } from "../artifacts/source-roots.js";
import { runBddScenario, runUnitTest } from "../artifacts/verify-runner.js";
import { type LocatedScenario, listLocatedScenarios, readFeatureSources } from "../artifacts/traceability.js";
import { parseBddTarget, parseUnitTarget, requireScenarioStart, scenarioTarget, UNIT_SEPARATOR } from "../artifacts/verify-target.js";
import { filesWithTest, normalizeVitestReport, selectTest, severalFilesRefusal, type UnitFileResult } from "../artifacts/vitest-report.js";
import { commandError } from "../cli-usage.js";
import { answerReturn, judgeReturn, moveFeature, moveToUnitRed, passedAtOnce, returnedFeature } from "./verify-return.js";
import { GREEN, runGreen } from "./verify-green.js";
import { INTEGRITY, runIntegrity } from "./verify-integrity.js";
import type { CliIo } from "../cli-io.js";

const RED = "red";
const SUBCOMMANDS = [RED, GREEN, INTEGRITY];
const DECIDE_FLAG = "--decide";
const DECISIONS: RedClass[] = [RED_CLASS.businessAssertion, RED_CLASS.missingImplementation, RED_CLASS.testBug, RED_CLASS.environment];
const VALID_RED_CLASSES: RedClass[] = [RED_CLASS.businessAssertion, RED_CLASS.missingImplementation];
const LIST_SEPARATOR = ", ";
const NEWLINE = "\n";
const STACK_FRAME = /^\s+at /;
const DECIDED_OUTSIDE_OID = "decided outside oid";
/** The checkpoint step a valid Red of a unit test, and of a scenario, verifies. */
const TDD_RED = CYCLE_STEP.tddRed;
const BDD_RED = CYCLE_STEP.bddRed;

/** Exit code of a verification that needs a person or an agent to decide the class. */
const NEEDS_A_DECISION = 2;

/** What the run of the test showed: a file that did not load, a test that passed, or a test that failed. */
function observe(files: UnitFileResult[], { file, name }: { file: string; name: string }, cwd: string): Failure {
  const unloaded = files.find((candidate) => candidate.message !== "");
  if (unloaded !== undefined) return { kind: FAILURE.load, message: unloaded.message };
  const selection = selectTest(files, name);
  if (selection.kind === "none") return { kind: FAILURE.noTest, name, file };
  const holders = filesWithTest(files, name);
  if (holders.length > 1) throw new ProgressError(severalFilesRefusal(name, holders.map((holder) => relative(cwd, holder))));
  if (selection.kind === "several") {
    throw new ProgressError(`several tests are named "${name}"; give the full name of one of them: ${selection.fullNames.join(LIST_SEPARATOR)}`);
  }
  const { status, failureMessages } = selection.test;
  if (status === "failed") return { kind: FAILURE.error, message: failureMessages[0]! };
  return status === "passed" ? { kind: FAILURE.passed } : { kind: FAILURE.notRun, status };
}

/** The failure message up to the first stack frame, the lines after the first indented. */
export function trimFailure(message: string): string {
  const lines = message.split(NEWLINE);
  const end = lines.findIndex((line) => STACK_FRAME.test(line));
  return (end < 0 ? lines : lines.slice(0, end)).join(`${NEWLINE}  `);
}

/** What a person or an agent needs to decide the class of a failure oid cannot classify alone, and how to say it. */
function renderDecision(target: string, message: string, { reason, candidate }: Extract<Verdict, { outcome: typeof OUTCOME.decision }>): string {
  const questions =
    candidate === RED_CLASS.businessAssertion
      ? [
          "  - Is this the assertion of the new behaviour, failing for the right reason?",
          "  - Does the test check something meaningful, not only toBeDefined and not only the absence of something?",
        ]
      : ["  - Does this failure come from behaviour that does not exist yet, rather than from a mistake in the test or in the environment?"];
  return [
    "red: needs a decision",
    `test: ${target}`,
    `failure: ${trimFailure(message)}`,
    `reason: ${reason}`,
    "questions:",
    ...questions,
    `answer with: oid verify red "${target}" ${DECIDE_FLAG} <class>`,
    "  business_assertion, missing_implementation: a valid Red (exit 0)",
    "  test_bug, environment: not a Red (exit 1)",
    "",
  ].join(NEWLINE);
}

/** The test to verify and the class a person or an agent decided, if any. */
function parseArgs(args: string[]): { target: string; decision: RedClass | undefined } {
  const [subcommand, target, ...options] = args;
  if (subcommand !== RED) throw commandError("subcommand", subcommand, SUBCOMMANDS);
  if (target === undefined) throw new ProgressError(`missing test: oid verify red "<test file> > <test name>"`);
  const decideAt = options.indexOf(DECIDE_FLAG);
  const decision = decideAt < 0 ? undefined : options[decideAt + 1];
  if (decision !== undefined && !DECISIONS.includes(decision as RedClass)) {
    throw new ProgressError(`unknown decision ${decision}; valid decisions: ${DECISIONS.join(LIST_SEPARATOR)}`);
  }
  return { target, decision: decision as RedClass | undefined };
}

/** A verdict that says whether the failure is a valid Red. */
type Decided = Exclude<Verdict, { outcome: typeof OUTCOME.decision }>;

/** The class a person or an agent gave to a failure that needed a decision. */
function decided(decision: RedClass): Decided {
  const outcome = VALID_RED_CLASSES.includes(decision) ? OUTCOME.valid : OUTCOME.invalid;
  return { outcome, class: decision, reason: DECIDED_OUTSIDE_OID };
}

/** What the run of the test or of the scenario showed, with the file the failure's names are imported in. */
export interface Observation {
  failure: Failure;
  importer: string | undefined;
}

/** The unit test or the scenario to verify. */
const TARGET = { test: "unit_test", scenario: "scenario" } as const;
type Target = { kind: typeof TARGET.test; test: { file: string; name: string } } | { kind: typeof TARGET.scenario; scenario: { file: string; line: number } };

/** The scenarios of the project, to look a target up by name; none when the target has the form of a unit test or the project has no configuration. */
function scenariosToName(cwd: string, target: string): LocatedScenario[] {
  if (target.includes(UNIT_SEPARATOR) || !existsSync(join(cwd, CONFIG_FILE))) return [];
  return listLocatedScenarios(readFeatureSources(cwd, loadVerifyConfig(cwd).paths.bdd_features));
}

/** Reads the target as a scenario when it is the location or the name of one, and as a unit test otherwise. */
function parseTarget(cwd: string, target: string): Target {
  const scenario = scenarioTarget(target, scenariosToName(cwd, target));
  const text = scenario !== undefined && parseBddTarget(target) !== undefined ? readText(cwd, scenario.file) : undefined;
  if (scenario !== undefined && text !== undefined) requireScenarioStart(scenario, listLocatedScenarios([{ path: scenario.file.replace(/^\.\//, ""), text }]));
  return scenario === undefined ? { kind: TARGET.test, test: parseUnitTarget(target) } : { kind: TARGET.scenario, scenario };
}

/** What a run of the unit runner did: its exit code and the vitest JSON report it wrote, if any. */
export type UnitRun = { exitCode: number | null; report: unknown };

/** What a unit run showed about one test, with the file the failure's names are imported in. */
export function observeUnitRun(cwd: string, { exitCode, report }: UnitRun, test: { file: string; name: string }): Observation {
  if (report === undefined) return { failure: { kind: FAILURE.noReport, runner: "unit", exitCode }, importer: test.file };
  const files = normalizeVitestReport(report);
  const failure = observe(files, test, cwd);
  const [ranIn] = filesWithTest(files, test.name);
  return { failure, importer: ranIn === undefined ? test.file : relative(cwd, ranIn) };
}

/** Runs one unit test and observes it. */
function observeUnit(cwd: string, config: ProjectConfig, test: { file: string; name: string }): Observation {
  return observeUnitRun(cwd, runUnitTest(cwd, config.commands.unit, test), test);
}

/** What the BDD runner did: its exit code, the Cucumber Messages report it wrote, if any, and its stderr. */
export type BddRun = { exitCode: number | null; report: string | undefined; stderr: string };

/** The step file changed since the checkpoint that the runner's stderr names, if any; asked only when the runner wrote no report, which is the only time it matters. */
function changedStepFile(cwd: string, config: ProjectConfig, stderr: string): string | undefined {
  return changedSinceCheckpoint(cwd, focusedFeature(cwd, config)).find((name) => isInsideSource(config.paths.bdd_steps, name) && stderr.includes(name));
}

/** What a run of the BDD runner showed about `scenario`; when the run held other scenarios too, `scenario.name` tells its steps from theirs. */
export function observeBddRun(cwd: string, config: ProjectConfig, scenario: { file: string; line: number; name?: string }, { exitCode, report, stderr }: BddRun): Observation {
  const only = scenario.name === undefined ? undefined : { file: scenario.file, name: scenario.name };
  const failure: Failure = report === undefined ? { kind: FAILURE.noReport, runner: "BDD", exitCode, changedFile: changedStepFile(cwd, config, stderr) } : observeScenario(normalizeCucumberReport(report, only), scenario);
  return { failure, importer: failure.kind === FAILURE.error ? failingFile(failure.message, cwd) : undefined };
}

/** Runs one scenario and observes it. */
function observeBdd(cwd: string, config: ProjectConfig, scenario: { file: string; line: number }): Observation {
  return observeBddRun(cwd, config, scenario, runBddScenario(cwd, config.commands.bdd, scenario));
}

/** Whether the first stack frame of a failure is a line of a unit test or a step file added since the last checkpoint. */
function isOnAddedTestLine(cwd: string, config: ProjectConfig, message: string): boolean {
  const frame = failingFrame(message, cwd);
  if (frame === undefined || !existsSync(join(cwd, frame.file))) return false;
  const isTest = isInsideSource(config.paths.unit_tests, frame.file) || isInsideSource(config.paths.bdd_steps, frame.file);
  return isTest && addedLines(cwd, frame.file, focusedFeature(cwd, config)).some(({ line }) => line === frame.line);
}

/** The class of what the run showed, by the deterministic rules of the Red Gate. */
export function classifyObservation(cwd: string, config: ProjectConfig, { failure, importer }: Observation): Verdict {
  return classifyFailure(failure, {
    cwd,
    isSource: (path) => isInsideSource(config.paths.source, path),
    resolveSymbol: (name) => (importer === undefined ? "external" : resolveImportedSymbol(cwd, importer, name)),
    isOnAddedTestLine: (message) => isOnAddedTestLine(cwd, config, message),
  });
}

/** The answer for a scenario whose step files cucumber could not load, and nothing when they load or the target is a unit test. */
function unloadableAnswer(cwd: string, config: ProjectConfig, parsed: Target): string | undefined {
  const problems = parsed.kind === TARGET.scenario ? loadableStepsProblems(cwd, config) : [];
  if (problems.length === 0) return undefined;
  return `red: not valid (${RED_CLASS.testBug}): cucumber would not start, because of a static import of something that does not exist yet\n${problems.join(NEWLINE)}\n`;
}

/** Prints the verdict, and records the checkpoint of the step when it is a valid Red: exit 0 when it is, 1 when it is not. */
function answer(io: CliIo, config: ProjectConfig, { target, step, external }: { target: string; step: string; external: boolean }, verdict: Decided): number {
  const valid = verdict.outcome === OUTCOME.valid;
  if (valid) recordVerified(io.cwd, config, { step, verify: { kind: RED, target }, external });
  io.stdout(`red: ${valid ? "valid" : "not valid"} (${verdict.class}): ${verdict.reason}\n`);
  if (valid && step === BDD_RED && moveToUnitRed(io.cwd, config.paths.progress)) io.stdout(`red: moved to ${TDD_RED}\n`);
  return valid ? 0 : 1;
}

/** Answers the failure the last run of `target` recorded with the class decided outside oid, without running the test again. */
function answerRecorded(io: CliIo, config: ProjectConfig, target: string, decision: RedClass): number {
  const { step } = observationToDecide(io.cwd, target, config.paths.progress);
  return answer(io, config, { target, step, external: true }, decided(decision));
}

/** The answer for a scenario that passes at once and still moves the feature to `tdd_red`; nothing when it does not. */
function answerPassed(io: CliIo, config: ProjectConfig, parsed: Target, target: string, { failure }: Observation): number | undefined {
  if (parsed.kind !== TARGET.scenario || failure.kind !== FAILURE.passed) return undefined;
  const { file, line } = parsed.scenario;
  const name = listLocatedScenarios(readFeatureSources(io.cwd, config.paths.bdd_features)).find((candidate) => candidate.file === file && candidate.line === line)?.name;
  const reason = passedAtOnce(io.cwd, config.paths.progress, name ?? "");
  if (reason === undefined) return undefined;
  recordVerified(io.cwd, config, { step: BDD_RED, verify: { kind: RED, target }, external: false });
  moveFeature(io.cwd, config.paths.progress, focusedFeature(io.cwd, config)!, TDD_RED);
  io.stdout(`red: moved to ${TDD_RED}: ${reason}\n`);
  return 0;
}

/** The answer for a scenario verified at `bdd_red` after a return, unless the cycle has no code, which the usual rules judge; nothing for any other target. */
function answerIfReturned(io: CliIo, config: ProjectConfig, parsed: Target, target: string): number | undefined {
  if (parsed.kind !== TARGET.scenario) return undefined;
  const { scenario } = parsed;
  const returned = returnedFeature(io.cwd, config.paths.progress);
  if (returned === undefined) return undefined;
  const passes = (): boolean => observeBdd(io.cwd, config, scenario).failure.kind === FAILURE.passed;
  const judged = judgeReturn(io.cwd, returned, (name) => isInsideSource(config.paths.source, name), passes);
  return judged.kind === "no_code" ? undefined : answerReturn(io, config.paths.progress, returned, target, judged);
}

/** The answer for a target that needs no observation: step files that would not load, or a scenario judged against the return of its feature. Nothing otherwise. */
function answerBeforeRunning(io: CliIo, config: ProjectConfig, parsed: Target, target: string): number | undefined {
  const unloadable = unloadableAnswer(io.cwd, config, parsed);
  if (unloadable === undefined) return answerIfReturned(io, config, parsed, target);
  recordObservation(io.cwd, { target, step: BDD_RED, message: unloadable, needsDecision: false });
  io.stdout(unloadable);
  return 1;
}

/** Runs one unit test or one scenario and says whether it is a valid Red: exit 0 when it is, 1 when it is not, 2 when a decision is needed. With `--decide`, answers the failure the last run recorded instead. */
export function runVerify(io: CliIo, args: string[]): number {
  if (args[0] === GREEN) return runGreen(io, args.slice(1));
  if (args[0] === INTEGRITY) return runIntegrity(io, args.slice(1));
  const { target, decision } = parseArgs(args);
  const parsed = parseTarget(io.cwd, target);
  const config = loadVerifyConfig(io.cwd);
  if (decision !== undefined) return answerRecorded(io, config, target, decision);
  const step = parsed.kind === TARGET.test ? TDD_RED : BDD_RED;
  const early = answerBeforeRunning(io, config, parsed, target);
  if (early !== undefined) return early;
  const observation = parsed.kind === TARGET.test ? observeUnit(io.cwd, config, parsed.test) : observeBdd(io.cwd, config, parsed.scenario);
  const passedAtOnce = answerPassed(io, config, parsed, target, observation);
  if (passedAtOnce !== undefined) return passedAtOnce;
  const verdict = classifyObservation(io.cwd, config, observation);
  const message = "message" in observation.failure ? observation.failure.message : "";
  recordObservation(io.cwd, { target, step, message, needsDecision: verdict.outcome === OUTCOME.decision });
  if (verdict.outcome === OUTCOME.decision) {
    io.stdout(renderDecision(target, message, verdict));
    return NEEDS_A_DECISION;
  }
  return answer(io, config, { target, step, external: false }, verdict);
}
