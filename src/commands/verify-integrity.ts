import { existsSync } from "node:fs";
import { join } from "node:path";
import { addedLines } from "../artifacts/added-lines.js";
import { baseContent, changedSinceCheckpoint } from "../artifacts/checkpoint.js";
import { type ChangedFile, FILE_KIND, type FileKind, forbiddenPatterns, integrityViolations } from "../artifacts/integrity.js";
import { NEWLINE } from "../artifacts/lines.js";
import { CYCLE_STEP, CYCLE_STEPS, FEATURE_STATUS, loadProgress, type Progress, ProgressError } from "../artifacts/progress.js";
import type { ProjectConfig } from "../artifacts/project-config.js";
import { readText } from "../artifacts/project-json.js";
import { changedSinceReturn, readReturn } from "../artifacts/return-record.js";
import { sourceReadLines } from "../artifacts/source-reads.js";
import { isInsideSource } from "../artifacts/source-roots.js";
import { listScenarios } from "../artifacts/traceability.js";
import { loadVerifyConfig } from "../artifacts/verified-checkpoint.js";
import type { CliIo } from "../cli-io.js";

export const INTEGRITY = "integrity";
const STEP_FLAG = "--step";
const LIST_SEPARATOR = ", ";
const FEATURE_TAG = /^@(FR-.+)$/;
/** The steps after `bdd_red`: a feature at one of them, or done, has approved feature files. */
const APPROVED_STEPS: string[] = [CYCLE_STEP.tddRed, CYCLE_STEP.tddGreen, CYCLE_STEP.refactor, CYCLE_STEP.qualityGate];

/** The step to check: the given one, or the step of the feature in focus. */
function stepToCheck(progress: Progress | undefined, args: string[]): string {
  const given = args[args.indexOf(STEP_FLAG) + 1];
  if (args.includes(STEP_FLAG) && given !== undefined) {
    if (!CYCLE_STEPS.includes(given)) throw new ProgressError(`unknown step ${given}; valid steps: ${CYCLE_STEPS.join(LIST_SEPARATOR)}`);
    return given;
  }
  const focus = progress?.features.find((feature) => feature.id === progress.current_focus);
  if (focus?.status === FEATURE_STATUS.done) {
    throw new ProgressError(`${focus.id} is done: run \`oid progress reopen ${focus.id}\` to address a review, or have the human run \`oid progress revise ${focus.id}\` if the requirement changed`);
  }
  if (focus?.cycle_step === undefined) throw new ProgressError(`no feature is focused: give the step with ${STEP_FLAG} <step>`);
  return focus.cycle_step;
}

/** What a file of the project is for the rules of integrity. */
function kindOf(config: ProjectConfig, name: string): FileKind | undefined {
  if (isInsideSource(config.paths.bdd_steps, name)) return FILE_KIND.step;
  if (isInsideSource(config.paths.unit_tests, name)) return FILE_KIND.unitTest;
  if (isInsideSource(config.paths.bdd_features, name)) return FILE_KIND.feature;
  return isInsideSource(config.paths.source, name) ? FILE_KIND.source : undefined;
}

/** Whether a feature file, as it was at the last checkpoint, belongs to a feature whose scenarios are approved. */
function isApproved(cwd: string, name: string, progress: Progress | undefined): boolean {
  const text = baseContent(cwd, name, progress?.current_focus ?? null);
  if (text === undefined || progress === undefined) return false;
  const tagged = new Set(listScenarios([{ path: name, text }]).flatMap(({ tags }) => tags.map((tag) => FEATURE_TAG.exec(tag)?.[1] ?? "")));
  return progress.features.some(({ id, status, cycle_step }) => tagged.has(id) && (status === FEATURE_STATUS.done || APPROVED_STEPS.includes(cycle_step ?? "")));
}

/** A file that changed since the last checkpoint, with what the rules need to know of it. */
function describeChange(cwd: string, config: ProjectConfig, progress: Progress | undefined, file: string): ChangedFile {
  const kind = kindOf(config, file);
  const exists = existsSync(join(cwd, file));
  const isSource = (path: string): boolean => isInsideSource(config.paths.source, path);
  return {
    file,
    kind,
    added: exists ? addedLines(cwd, file, progress?.current_focus ?? null) : [],
    approvedFeature: kind === FILE_KIND.feature && isApproved(cwd, file, progress),
    sourceReads: exists && (kind === FILE_KIND.unitTest || kind === FILE_KIND.step) ? sourceReadLines(readText(cwd, file)!, file, isSource) : [],
  };
}

/** The files that changed since what the feature in focus is judged against: the return it made to `bdd_red` when it has one, and its checkpoint otherwise. */
function changedFiles(cwd: string, focus: string | null, step: string): string[] {
  return step === CYCLE_STEP.bddRed && focus !== null && readReturn(cwd, focus) !== undefined ? changedSinceReturn(cwd, focus) : changedSinceCheckpoint(cwd, focus);
}

/** One line for each rule of `step` that the changes since the checkpoint of the feature in focus (since its return, at `bdd_red` after one) break. */
export function integrityProblems(cwd: string, config: ProjectConfig, progress: Progress | undefined, step: string): string[] {
  const files = changedFiles(cwd, progress?.current_focus ?? null, step).map((file) => describeChange(cwd, config, progress, file));
  return integrityViolations(step, files, forbiddenPatterns(config));
}

/** Checks the changes since the checkpoint of the feature in focus against the rules of a step: exit 0 when none breaks one, 1 when one does. */
export function runIntegrity(io: CliIo, args: string[]): number {
  const config = loadVerifyConfig(io.cwd);
  const progress = existsSync(join(io.cwd, config.paths.progress)) ? loadProgress(io.cwd, config.paths.progress) : undefined;
  const violations = integrityProblems(io.cwd, config, progress, stepToCheck(progress, args));
  io.stdout(violations.length === 0 ? `${INTEGRITY}: ok${NEWLINE}` : `${violations.join(NEWLINE)}${NEWLINE}`);
  return violations.length === 0 ? 0 : 1;
}
