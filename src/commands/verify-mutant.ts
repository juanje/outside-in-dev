import { FAILURE, type Failure } from "../artifacts/red-classification.js";
import { isAssertionFailure, MutantError, mutantFiles, withMutant } from "../artifacts/mutant.js";
import { loadProgress, ProgressError, recordMutant, requireFeature, saveProgress } from "../artifacts/progress.js";
import { loadProjectPaths } from "../artifacts/project-paths.js";
import type { ProjectConfig } from "../artifacts/project-config.js";
import { rejection, renderRejection } from "../artifacts/rejection.js";
import { changedSinceReturn, readReturn } from "../artifacts/return-record.js";
import { scenarioText } from "../artifacts/revise-record.js";
import { isInsideSource } from "../artifacts/source-roots.js";
import { listLocatedScenarios, readFeatureSources } from "../artifacts/traceability.js";
import { TARGET } from "../artifacts/verify-target.js";
import { focusedFeature } from "../artifacts/verified-checkpoint.js";
import type { CliIo } from "../cli-io.js";
import type { Observation, Target } from "./verify.js";
import { failureMessage, trimFailure } from "./verify.js";
import { answerReturn, type ReturnKind, returnedFeature, SCENARIO_RETURN, TEST_RETURN } from "./verify-return.js";
import { CYCLE_STEP } from "../artifacts/progress.js";

const LIST_SEPARATOR = ", ";
const NEWLINE = "\n";
/** The kind of a judgement that returns the feature. */
const RETURNED = "returned";

/** What `oid verify red <target> --mutant` works on: the diff, the target and how to run it. */
export interface MutantRequest {
  io: CliIo;
  config: ProjectConfig;
  target: string;
  parsed: Target;
  diff: string;
  /** Runs the target once and observes it. */
  observe: (parsed: Target) => Observation;
}

/** Prints why the mutant is refused and what to do about it: exit 1. */
function refused({ io, target }: MutantRequest, reason: string, action: string, failure?: Failure): number {
  const message = failure === undefined ? "" : failureMessage(failure);
  const evidence = [`test: ${target}`, ...(message === "" ? [] : [`failure: ${trimFailure(message)}`])].join(NEWLINE);
  io.stdout(`${renderRejection(rejection({ failed: `red: mutant refused: ${reason}`, evidence, next: action }))}\n`);
  return 1;
}

/** Why the diff is refused before it is applied: it changes nothing, or something that is not source. */
function unfit(files: string[], source: string[]): { reason: string; action: string } | undefined {
  if (files.length === 0) return { reason: "the diff changes no file", action: "give a unified diff of the source" };
  const outside = files.filter((name) => !isInsideSource(source, name));
  if (outside.length === 0) return undefined;
  return { reason: `${outside.join(LIST_SEPARATOR)} ${outside.length === 1 ? "is" : "are"} not source: the mutant may change only the source`, action: "give a diff that changes only source files" };
}

/** The name of the scenario that starts at the location of the target. */
function scenarioNameAt(request: MutantRequest, scenario: { file: string; line: number }): string | undefined {
  const located = listLocatedScenarios(readFeatureSources(request.io.cwd, request.config.paths.bdd_features));
  return located.find((candidate) => candidate.file === scenario.file && candidate.line === scenario.line)?.name;
}

/** Records the diff next to the status of the scenario in the progress of `feature`, with the text it was proved on; the reason it cannot be recorded, if any. */
function recordForScenario(request: MutantRequest, feature: string, scenario: { file: string; line: number }): string | undefined {
  const { cwd } = request.io;
  const progressFile = request.config.paths.progress;
  const progress = loadProgress(cwd, progressFile);
  const tracked = requireFeature(progress, feature, progressFile);
  const name = scenarioNameAt(request, scenario);
  const text = name === undefined ? undefined : scenarioText(cwd, loadProjectPaths(cwd), tracked, name);
  if (name === undefined || text === undefined) return `the scenario is not tagged with @${feature}`;
  progress.features[progress.features.indexOf(tracked)] = recordMutant(tracked, name, { diff: request.diff, text });
  saveProgress(cwd, progress, progressFile);
  return undefined;
}

/** Why the proof cannot go on before anything runs: the diff is not fit, the feature did not go back to a Red, or source changed since it did. */
function refusalBeforeRunning(request: MutantRequest, returned: string | undefined): { reason: string; action: string } | undefined {
  const { config, parsed, io } = request;
  const unfitDiff = unfit(mutantFiles(request.diff), config.paths.source);
  if (unfitDiff !== undefined) return unfitDiff;
  if (returned === undefined) {
    return parsed.kind === TARGET.test ? { reason: "the feature did not go back to a Red", action: "go back with oid progress step <FR> tdd_red, fix the test, then run this again" } : undefined;
  }
  const moved = changedSinceReturn(io.cwd, returned).filter((name) => isInsideSource(config.paths.source, name));
  return moved.length === 0 ? undefined : { reason: `${moved.join(LIST_SEPARATOR)} changed since the return`, action: `undo the changes to ${moved.join(LIST_SEPARATOR)}` };
}

/** What the run with the diff applied showed, or the error when the diff does not apply. */
function observeMutated(request: MutantRequest): Observation | MutantError {
  try {
    return withMutant(request.io.cwd, request.diff, () => request.observe(request.parsed));
  } catch (error) {
    if (error instanceof MutantError) return error;
    throw error;
  }
}

/**
 * Proves a fixed test or scenario with a mutant (ADR-056): the diff is applied to the source for one run, which must fail on an assertion of the target, and the source is put back; the target
 * must pass as it is. A fixed test or scenario of a feature that went back to a Red returns the feature to the step it came from; a scenario with no return only records the diff. Exit 0 or 1.
 */
export function runMutant(request: MutantRequest): number {
  const { io, config, parsed } = request;
  const noun = parsed.kind === TARGET.scenario ? SCENARIO_RETURN.noun : TEST_RETURN.noun;
  const returned = returnedFeature(io.cwd, config.paths.progress, parsed.kind === TARGET.scenario ? CYCLE_STEP.bddRed : CYCLE_STEP.tddRed);
  const early = refusalBeforeRunning(request, returned);
  if (early !== undefined) return refused(request, early.reason, early.action);
  const mutated = observeMutated(request);
  if (mutated instanceof MutantError) return refused(request, mutated.message, "give a diff made against the source as it is now");
  if (mutated.failure.kind === FAILURE.passed) return refused(request, `the ${noun} still passes with the mutant`, `give a mutant that breaks what the ${noun} checks`);
  if (!isAssertionFailure(io.cwd, mutated.failure)) {
    return refused(request, `the ${noun} fails with the mutant, but not on an assertion of the ${noun}`, "give a mutant that makes an assertion fail, not one that breaks an import or a call", mutated.failure);
  }
  const plain = request.observe(parsed);
  if (plain.failure.kind !== FAILURE.passed) return refused(request, `the ${noun} does not pass`, `fix the ${noun} so that it passes with the source as it is`, plain.failure);
  return prove(request, returned);
}

/** Records the proof of a target that passes and fails on an assertion with the mutant: the move back for a feature that went back to a Red, the diff in the progress for a scenario. */
function prove(request: MutantRequest, returned: string | undefined): number {
  const { io, config, parsed, target, diff } = request;
  const files = mutantFiles(diff);
  const comeBack = (feature: string, subject: ReturnKind): number =>
    answerReturn(io, config.paths.progress, feature, target, { kind: RETURNED, to: readReturn(io.cwd, feature)!.from, files }, subject, diff);
  if (parsed.kind === TARGET.test) return comeBack(returned!, TEST_RETURN);
  const feature = returned ?? focusedFeature(io.cwd, config);
  if (feature === null) throw new ProgressError("no feature is in focus: the mutant of a scenario is recorded in its feature");
  const unrecorded = recordForScenario(request, feature, parsed.scenario);
  if (unrecorded !== undefined) return refused(request, unrecorded, "tag the scenario with its feature");
  if (returned !== undefined) return comeBack(returned, SCENARIO_RETURN);
  io.stdout(`red: mutant proved: the scenario passes, and it fails with the mutant on an assertion (${files.join(LIST_SEPARATOR)})\n`);
  return 0;
}
