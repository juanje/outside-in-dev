import { existsSync } from "node:fs";
import { join } from "node:path";
import { recordCheckpoint } from "../artifacts/checkpoint.js";
import { cycleCodeFiles, withoutCycleCode } from "../artifacts/cycle-code.js";
import { requirePassEvidence } from "../artifacts/scenario-evidence.js";
import { CYCLE_STEP, type FeatureProgress, loadProgress, ProgressError, SCENARIO_STATUS, requireFeature, saveProgress } from "../artifacts/progress.js";
import type { CliIo } from "../cli-io.js";
import { changedSinceReturn, clearReturn, readReturn } from "../artifacts/return-record.js";

const LIST_SEPARATOR = ", ";
/** What judging a scenario at `bdd_red` after a return found. */
export type Judgement = { kind: "refused"; reason: string } | { kind: "returned"; to: string; files: string[] } | { kind: "no_code" };

function refuse(reason: string): Judgement {
  return { kind: "refused", reason };
}

/** Judges a scenario run at `bdd_red` with a return: refused when source changed since the return, without running the scenario, when it does not pass, or when it also passes without the code of the cycle; `passes` runs it. */
export function judgeReturn(cwd: string, feature: string, isSource: (name: string) => boolean, passes: () => boolean): Judgement {
  const moved = changedSinceReturn(cwd, feature).filter(isSource);
  if (moved.length > 0) return refuse(`${moved.join(LIST_SEPARATOR)} changed since the return`);
  const files = cycleCodeFiles(cwd, feature, isSource);
  if (files.length === 0) return { kind: "no_code" };
  if (!passes()) return refuse("the scenario does not pass");
  if (withoutCycleCode(cwd, feature, isSource, passes)) return refuse("the scenario passes without this cycle's code");
  return { kind: "returned", to: readReturn(cwd, feature)!.from, files };
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

/** The feature in focus when it is at `bdd_red` with a return, which judges the scenarios it verifies. */
export function returnedFeature(cwd: string, progressFile: string): string | undefined {
  const focused = focusedProgress(cwd, progressFile);
  return focused?.cycle_step === CYCLE_STEP.bddRed && readReturn(cwd, focused.id) !== undefined ? focused.id : undefined;
}

/** Prints what judging the scenario found and, when the feature returns, records the checkpoint and moves it: exit 0 when it returned, 1 when it did not. */
export function answerReturn(io: CliIo, progressFile: string, feature: string, target: string, judged: Exclude<Judgement, { kind: "no_code" }>): number {
  if (judged.kind === "refused") {
    io.stdout(`red: not returned: ${judged.reason}\n`);
    return 1;
  }
  recordCheckpoint(io.cwd, { step: CYCLE_STEP.bddRed, feature, verify: { kind: "red", target }, external: false, date: new Date(), returned: true });
  moveFeature(io.cwd, progressFile, feature, judged.to);
  io.stdout(`red: returned to ${judged.to}: the scenario passes, src/ is as it was at the return, and it fails without this cycle's code (${judged.files.join(LIST_SEPARATOR)})\n`);
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
