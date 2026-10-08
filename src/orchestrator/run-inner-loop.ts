import { type Started, isExitCode } from "./begin.js";
import { AFTER_CHECK, runBddCheck } from "./run-bdd-check.js";
import { runBddRed, type RedScenario } from "./run-bdd-red.js";
import { headCommit } from "../artifacts/git-workspace.js";
import { runCodeGreen } from "./run-code-green.js";
import { runQualityGate } from "./run-quality-gate.js";
import { runRefactor } from "./run-refactor.js";
import { runTddRed } from "./run-tdd-red.js";
import type { FeatureServices } from "./services.js";

/** Runs the inner loop of one scenario that failed validly, from TDD Red to a BDD Check that finds it green: returns the exit code of the process when the run ends there, or what follows the green. */
async function innerLoop(started: Started, services: FeatureServices, red: RedScenario): Promise<number | typeof AFTER_CHECK.next | typeof AFTER_CHECK.last> {
  let scenario = red;
  for (let iteration = 1; ; iteration += 1) {
    const unitRed = await runTddRed(started, services, scenario);
    if (isExitCode(unitRed)) return unitRed;
    const beforeGreen = headCommit(started.workspace.path);
    const stopped = await runCodeGreen(started, services, scenario, unitRed);
    if (stopped !== undefined) return stopped;
    const origin = await runRefactor(started, services, scenario, beforeGreen);
    const checked = await runBddCheck(started, services, scenario, iteration, origin);
    if (isExitCode(checked)) return checked;
    if (checked.kind === AFTER_CHECK.last) return AFTER_CHECK.last;
    if (checked.kind === AFTER_CHECK.next) return AFTER_CHECK.next;
    scenario = { ...scenario, failure: checked.failure };
  }
}

/** Runs the scenarios of the first target one after the other, each through BDD Red and the inner loop, until every one passes: returns the exit code of the process. */
export async function runInnerLoop(started: Started, services: FeatureServices, featureHashes: Record<string, string>): Promise<number> {
  for (;;) {
    const red = await runBddRed(started, services, featureHashes);
    if (isExitCode(red)) return red;
    const ended = await innerLoop(started, services, red);
    if (isExitCode(ended)) return ended;
    if (ended === AFTER_CHECK.last) return runQualityGate(started, services);
  }
}
