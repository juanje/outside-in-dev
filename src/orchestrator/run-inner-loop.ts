import { type Started, isExitCode, STATE, transition } from "./begin.js";
import { AFTER_CHECK, type AfterCheck, type Origin, runBddCheck } from "./run-bdd-check.js";
import { runBddRed, type RedScenario } from "./run-bdd-red.js";
import { headCommit } from "../artifacts/git-workspace.js";
import { runCodeGreen } from "./run-code-green.js";
import { commitFeature } from "./run-commit.js";
import { runQualityGate } from "./run-quality-gate.js";
import { runRefactor } from "./run-refactor.js";
import { runTddRed, type TddRed } from "./run-tdd-red.js";
import { updateSession } from "./session.js";
import type { FeatureServices } from "./services.js";

/** Where a resumed run enters the work of its first target: the state it stopped in and what the session saved for it (the scenario of the inner loop, what TDD Red handed on, the checkpoint before Code Green and the iteration). */
type LoopEntry = { state: string; red?: RedScenario; unitRed?: TddRed; beforeGreen?: string; iteration?: number };

/** Where a resumed run enters the inner loop: the commit its first target started from, and the state of that target. */
export type LoopResume = { featureStart: string; entry: LoopEntry };

/** The states of one iteration of the inner loop, in order. */
const ITERATION: string[] = [STATE.tddRed, STATE.codeGreen, STATE.refactor, STATE.bddCheck];

/** Where the BDD Check of a run resumed at it comes from: the state itself. */
const RESUMED_CHECK: Origin = { from: STATE.bddCheck, note: "resumed" };

/** Whether the iteration entered at `entry` is already past `state`. */
const isPast = (entry: LoopEntry | undefined, state: string): boolean => entry !== undefined && ITERATION.indexOf(entry.state) > ITERATION.indexOf(state);

/** Runs TDD Red (unless it is past) and Code Green, and saves the checkpoint before the green for the refactor: returns it, or the exit code of the process. */
async function redToGreen(started: Started, services: FeatureServices, scenario: RedScenario, entry: LoopEntry | undefined): Promise<number | string> {
  const unitRed = isPast(entry, STATE.tddRed) ? entry!.unitRed! : await runTddRed(started, services, scenario);
  if (isExitCode(unitRed)) return unitRed;
  const beforeGreen = headCommit(started.workspace.path);
  const stopped = await runCodeGreen(started, services, scenario, unitRed);
  if (stopped !== undefined) return stopped;
  updateSession(started.cwd, { beforeGreen });
  return beforeGreen;
}

/** One iteration of the inner loop, from TDD Red, or from the state a resumed run entered at: returns what the BDD Check led to, or the exit code of the process. */
async function iterate(started: Started, services: FeatureServices, scenario: RedScenario, iteration: number, entry: LoopEntry | undefined): Promise<number | AfterCheck> {
  const beforeGreen = isPast(entry, STATE.codeGreen) ? entry!.beforeGreen! : await redToGreen(started, services, scenario, entry);
  if (isExitCode(beforeGreen)) return beforeGreen;
  const origin = isPast(entry, STATE.refactor) ? RESUMED_CHECK : await runRefactor(started, services, scenario, beforeGreen);
  return runBddCheck(started, services, scenario, iteration, origin);
}

/** Runs the inner loop of one scenario that failed validly, from TDD Red (or the state a resumed run entered at) to a BDD Check that finds it green: returns the exit code of the process when the run ends there, or what follows the green. */
async function innerLoop(started: Started, services: FeatureServices, red: RedScenario, entry?: LoopEntry): Promise<number | typeof AFTER_CHECK.next | typeof AFTER_CHECK.last> {
  let scenario = red;
  let resumed = entry;
  for (let iteration = entry?.iteration ?? 1; ; iteration += 1) {
    const checked = await iterate(started, services, scenario, iteration, resumed);
    resumed = undefined;
    if (isExitCode(checked)) return checked;
    if (checked.kind === AFTER_CHECK.last) return AFTER_CHECK.last;
    if (checked.kind === AFTER_CHECK.next) return AFTER_CHECK.next;
    scenario = { ...scenario, failure: checked.failure };
  }
}

/** Runs the scenarios of the first target one after the other, each through BDD Red and the inner loop, until every one passes, then its quality gate: returns the exit code of the process when the run ends there, nothing when the target is ready to be committed. A resumed run enters at the state it stopped in. */
async function runFeature(started: Started, services: FeatureServices, featureHashes: Record<string, string>, entry?: LoopEntry): Promise<number | undefined> {
  if (entry?.state === STATE.frCommit) return undefined;
  if (entry?.state === STATE.qualityGate) return runQualityGate(started, services);
  let resumed = entry?.red === undefined ? undefined : entry;
  for (;;) {
    const red = resumed?.red ?? (await runBddRed(started, services, featureHashes));
    if (isExitCode(red)) return red;
    const ended = await innerLoop(started, services, red, resumed);
    resumed = undefined;
    if (isExitCode(ended)) return ended;
    if (ended === AFTER_CHECK.last) return runQualityGate(started, services);
  }
}

/** Runs the target features one after the other, each through its scenarios, its quality gate and its commit: returns the exit code of the process. A resumed run enters its first target at the state it stopped in, from the commit that target started at. */
export async function runInnerLoop(started: Started, services: FeatureServices, featureHashes: Record<string, string>, resume?: LoopResume): Promise<number> {
  let from = resume?.featureStart ?? started.workspace.startCommit;
  for (let done = 0; done < started.targets.length; done += 1) {
    const current = { ...started, targets: started.targets.slice(done) };
    const stopped = await runFeature(current, services, featureHashes, done === 0 ? resume?.entry : undefined);
    if (stopped !== undefined) return stopped;
    from = commitFeature(current, from);
    const [, next] = current.targets;
    updateSession(started.cwd, { state: next === undefined ? STATE.done : STATE.bddRed, featureStart: from });
    transition(started.bus, STATE.frCommit, next === undefined ? STATE.done : STATE.bddRed, next === undefined ? "every target feature is committed" : `${current.targets[0]} is committed; ${next} is next`);
  }
  return 0;
}
