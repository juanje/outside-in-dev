import { existsSync } from "node:fs";
import { join } from "node:path";
import { recordCheckpoint } from "../artifacts/checkpoint.js";
import { cycleCodeFiles, withoutCycleCode } from "../artifacts/cycle-code.js";
import { requirePassEvidence } from "../artifacts/scenario-evidence.js";
import { CYCLE_STEP, type FeatureProgress, loadProgress, ProgressError, SCENARIO_STATUS, requireFeature, saveProgress } from "../artifacts/progress.js";
import type { CliIo } from "../cli-io.js";
import { TARGET } from "../artifacts/verify-target.js";
import { changedSinceReturn, clearReturn, readReturn } from "../artifacts/return-record.js";

const LIST_SEPARATOR = ", ";
/** The kind of a judgement that refuses the return. */
export const REFUSED = "refused";
/** The judgement of a cycle that has no code to remove, which the usual rules judge. */
export const NO_CODE = "no_code";

/** What judging a scenario at `bdd_red` after a return found. */
export type Judgement = { kind: typeof REFUSED; reason: string } | { kind: "returned"; to: string; files: string[] } | { kind: typeof NO_CODE };

export function refuse(reason: string): Extract<Judgement, { kind: typeof REFUSED }> {
  return { kind: REFUSED, reason };
}

/** What is judged after a return: a scenario at `bdd_red` or a unit test at `tdd_red`, and the Red step it is verified at. */
export interface ReturnKind {
  noun: string;
  step: string;
}

export const SCENARIO_RETURN: ReturnKind = { noun: TARGET.scenario, step: CYCLE_STEP.bddRed };
export const TEST_RETURN: ReturnKind = { noun: "test", step: CYCLE_STEP.tddRed };

/** What is judged, and how it is run with the code of the cycle removed. */
export interface ReturnSubject extends ReturnKind {
  /** Run while the code of the cycle is removed: why the return is refused, or nothing when the subject is as a Red. */
  refusalWithoutCode: () => string | undefined;
}

/** A scenario, which has to fail without the code of the cycle: `passes` runs it. */
function scenarioSubject(passes: () => boolean): ReturnSubject {
  return { ...SCENARIO_RETURN, refusalWithoutCode: () => (passes() ? "the scenario passes without this cycle's code" : undefined) };
}

/** Judges a scenario or a test verified with a return: refused when source changed since the return, without running it, when it does not pass, or when it is not a Red without the code of the cycle; `passes` runs it. */
export function judgeReturn(cwd: string, feature: string, isSource: (name: string) => boolean, passes: () => boolean, subject: ReturnSubject = scenarioSubject(passes)): Judgement {
  const moved = changedSinceReturn(cwd, feature).filter(isSource);
  if (moved.length > 0) return refuse(`${moved.join(LIST_SEPARATOR)} changed since the return`);
  const files = cycleCodeFiles(cwd, feature, isSource);
  if (files.length === 0) return { kind: NO_CODE };
  if (!passes()) return refuse(`the ${subject.noun} does not pass`);
  const refusal = withoutCycleCode(cwd, feature, isSource, subject.refusalWithoutCode);
  return refusal === undefined ? { kind: "returned", to: readReturn(cwd, feature)!.from, files } : refuse(refusal);
}

/** Moves `feature` to `step` by writing the progress directly, which is not a manual transition, and forgets its return. */
export function moveFeature(cwd: string, progressFile: string, feature: string, step: string): void {
  const progress = loadProgress(cwd, progressFile);
  requireFeature(progress, feature, progressFile).cycle_step = step;
  saveProgress(cwd, progress, progressFile);
  clearReturn(cwd, feature);
}

/** Whether `scenario` of `feature` is recorded as passing, an earlier green ran it, and nothing but the progress file changed since. */
export function hasGreenEvidence(cwd: string, progressFile: string, feature: string, scenario: string): boolean {
  const recorded = requireFeature(loadProgress(cwd, progressFile), feature, progressFile).scenarios?.find(({ name }) => name === scenario);
  if (recorded?.bdd !== SCENARIO_STATUS.pass) return false;
  try {
    requirePassEvidence(cwd, feature, scenario);
    return true;
  } catch (error) {
    if (error instanceof ProgressError) return false;
    throw error;
  }
}

/** The feature in focus, when the project has a progress file and a feature is focused. */
function focusedProgress(cwd: string, progressFile: string): FeatureProgress | undefined {
  if (!existsSync(join(cwd, progressFile))) return undefined;
  const progress = loadProgress(cwd, progressFile);
  return progress.features.find(({ id }) => id === progress.current_focus);
}

/** The feature in focus when it is at `step` (`bdd_red`, which judges the scenarios it verifies, or `tdd_red`, which judges its tests) with a return. */
export function returnedFeature(cwd: string, progressFile: string, step: string = CYCLE_STEP.bddRed): string | undefined {
  const focused = focusedProgress(cwd, progressFile);
  return focused?.cycle_step === step && readReturn(cwd, focused.id) !== undefined ? focused.id : undefined;
}

/** Prints what judging the scenario or test found and, when the feature returns, records the checkpoint and moves it: exit 0 when it returned, 1 when it did not. */
export function answerReturn(io: CliIo, progressFile: string, feature: string, target: string, judged: Exclude<Judgement, { kind: typeof NO_CODE }>, subject: ReturnKind = SCENARIO_RETURN): number {
  if (judged.kind === REFUSED) {
    io.stdout(`red: not returned: ${judged.reason}\n`);
    return 1;
  }
  recordCheckpoint(io.cwd, { step: subject.step, feature, verify: { kind: "red", target }, external: false, date: new Date(), returned: true });
  moveFeature(io.cwd, progressFile, feature, judged.to);
  io.stdout(`red: returned to ${judged.to}: the ${subject.noun} passes, src/ is as it was at the return, and it fails without this cycle's code (${judged.files.join(LIST_SEPARATOR)})\n`);
  return 0;
}

/** Moves the feature in focus on to `tdd_red` when it is at `bdd_red` with a return and the cycle has no code: whether it moved. */
export function moveToUnitRed(cwd: string, progressFile: string): boolean {
  const feature = returnedFeature(cwd, progressFile);
  if (feature === undefined) return false;
  moveFeature(cwd, progressFile, feature, CYCLE_STEP.tddRed);
  return true;
}

/** Why a scenario that passes at once still moves the feature in focus on to `tdd_red`, when it does: the feature went back to `bdd_red` and the code of earlier cycles may satisfy the scenario, or the scenario is recorded as passing with the evidence of an earlier green. */
export function passedAtOnce(cwd: string, progressFile: string, scenario: string): string | undefined {
  if (returnedFeature(cwd, progressFile) !== undefined) return "the scenario already passes; the unit test is still needed";
  const focused = focusedProgress(cwd, progressFile);
  if (focused?.cycle_step === CYCLE_STEP.bddRed && hasGreenEvidence(cwd, progressFile, focused.id, scenario)) return "the scenario already passes and an earlier green ran it";
  return undefined;
}
