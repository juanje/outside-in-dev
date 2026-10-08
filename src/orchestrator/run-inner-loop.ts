import { type Started, isExitCode } from "./begin.js";
import { AFTER_CHECK, runBddCheck } from "./run-bdd-check.js";
import { runBddRed, type RedScenario } from "./run-bdd-red.js";
import { runCodeGreen } from "./run-code-green.js";
import { runTddRed } from "./run-tdd-red.js";
import type { FeatureServices } from "./services.js";

const END_OF_FEATURE = 0;

/** Runs the inner loop of one scenario that failed validly, from TDD Red to a BDD Check that finds it green: returns the exit code of the process when the run ends there, or what follows the green. */
async function innerLoop(started: Started, services: FeatureServices, red: RedScenario): Promise<number | typeof AFTER_CHECK.next> {
  let scenario = red;
  for (let iteration = 1; ; iteration += 1) {
    const unitRed = await runTddRed(started, services, scenario);
    if (isExitCode(unitRed)) return unitRed;
    const stopped = await runCodeGreen(started, services, scenario, unitRed);
    if (stopped !== undefined) return stopped;
    // REFACTOR (micro) goes here, between Code Green and the BDD check.
    const checked = await runBddCheck(started, services, scenario, iteration);
    if (isExitCode(checked)) return checked;
    if (checked.kind === AFTER_CHECK.last) return END_OF_FEATURE;
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
  }
}
