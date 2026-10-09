import { type Started, isExitCode, STATE, transition } from "./begin.js";
import { AFTER_CHECK, runBddCheck } from "./run-bdd-check.js";
import { runBddRed, type RedScenario } from "./run-bdd-red.js";
import { headCommit } from "../artifacts/git-workspace.js";
import { runCodeGreen } from "./run-code-green.js";
import { commitFeature } from "./run-commit.js";
import { runQualityGate } from "./run-quality-gate.js";
import { runRefactor } from "./run-refactor.js";
import { runTddRed } from "./run-tdd-red.js";
import { updateSession } from "./session.js";
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

/** Runs the scenarios of the first target one after the other, each through BDD Red and the inner loop, until every one passes, then its quality gate: returns the exit code of the process when the run ends there, nothing when the target is ready to be committed. */
async function runFeature(started: Started, services: FeatureServices, featureHashes: Record<string, string>): Promise<number | undefined> {
  for (;;) {
    const red = await runBddRed(started, services, featureHashes);
    if (isExitCode(red)) return red;
    const ended = await innerLoop(started, services, red);
    if (isExitCode(ended)) return ended;
    if (ended === AFTER_CHECK.last) return runQualityGate(started, services);
  }
}

/** Runs the target features one after the other, each through its scenarios, its quality gate and its commit: returns the exit code of the process. */
export async function runInnerLoop(started: Started, services: FeatureServices, featureHashes: Record<string, string>): Promise<number> {
  let from = started.workspace.startCommit;
  for (let done = 0; done < started.targets.length; done += 1) {
    const current = { ...started, targets: started.targets.slice(done) };
    const stopped = await runFeature(current, services, featureHashes);
    if (stopped !== undefined) return stopped;
    from = commitFeature(current, from);
    const [, next] = current.targets;
    updateSession(started.cwd, { state: next === undefined ? STATE.done : STATE.bddRed });
    transition(started.bus, STATE.frCommit, next === undefined ? STATE.done : STATE.bddRed, next === undefined ? "every target feature is committed" : `${current.targets[0]} is committed; ${next} is next`);
  }
  return 0;
}
