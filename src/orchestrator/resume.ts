import { existsSync } from "node:fs";
import { rollback } from "../artifacts/git-checkpoints.js";
import { headCommit, uncommittedFiles, type Workspace } from "../artifacts/git-workspace.js";
import { FEATURE_STATUS, loadProgress, ProgressError } from "../artifacts/progress.js";
import { loadProjectConfig } from "../artifacts/project-config.js";
import { createEventBus } from "../events/bus.js";
import { RESUMED } from "../events/types.js";
import { type Started, STATE } from "./begin.js";
import { releaseLock, takeOverLock } from "./lock.js";
import { requireSetup } from "./preflight.js";
import { type ReviewEntry, writeAndReview } from "./run-features.js";
import { type LoopResume, runInnerLoop } from "./run-inner-loop.js";
import type { RedScenario } from "./run-bdd-red.js";
import { endOnGitFailure } from "./run-git-failure.js";
import { RunStopped } from "./run-stopped.js";
import { readSession, type RunSession, updateSession } from "./session.js";
import type { RunServices } from "./services.js";

/** The states of the start of a run: it has no checkpoint yet, so it cannot be resumed (start a new run). */
const START_STATES: string[] = [STATE.idle, STATE.preflight, STATE.baseline, STATE.specCheck, STATE.selectFr];
/** The states of the inner loop, which need the scenario the session saved. */
const LOOP_STATES: string[] = [STATE.tddRed, STATE.codeGreen, STATE.refactor, STATE.bddCheck];
/** What the rollback of a resumed run cleans: every untracked file that is not ignored. */
const EVERY_FILE = ["**"];
/** What separates the feature file from the line in a saved location. */
const LOCATION_SEPARATOR = ":";

/** Where a resumed run goes on: the review of the feature files (or their writing), or the work of the targets left. */
export type ResumePlan = ({ review: ReviewEntry } | LoopResume) & { targets: string[] };

/** The scenario of the inner loop as the session saved it, with the failure it showed last. */
function savedScenario(saved: RunSession): RedScenario {
  const { scenario, fr } = saved;
  if (scenario === undefined || fr === undefined) throw new ProgressError(`the session of the run ${saved.runId} names no scenario for ${saved.state}`);
  const at = scenario.location.lastIndexOf(LOCATION_SEPARATOR);
  return { current: { file: scenario.location.slice(0, at), line: Number(scenario.location.slice(at + 1)), name: scenario.name }, label: `${fr} "${scenario.name}"`, failure: saved.scenarioFailure ?? "" };
}

/** Where a run that stopped in `saved.state` goes on, given the target features that are done in its worktree: the targets left (the one being committed stays, since its commit is made again), the commit the first one started from and the state it enters at. A quality fix goes on from the start of the quality gate. */
export function resumePlan(saved: RunSession, done: string[]): ResumePlan {
  const { state } = saved;
  const all = saved.targetFrs ?? [];
  if (state === STATE.featureWrite) return { targets: all, review: { comment: saved.reviewComment } };
  if (state === STATE.featureReview) return { targets: all, review: { files: saved.featureFiles } };
  const targets = all.filter((fr) => !done.includes(fr) || (state === STATE.frCommit && fr === saved.fr));
  const featureStart = saved.featureStart ?? saved.baseCommit;
  if (!LOOP_STATES.includes(state)) return { targets, featureStart, entry: { state: state === STATE.qualityFix ? STATE.qualityGate : state } };
  return { targets, featureStart, entry: { state, red: savedScenario(saved), unitRed: saved.unitRed, beforeGreen: saved.beforeGreen, iteration: saved.innerIteration } };
}

/** The session of the run to resume, refusing a run that cannot be. */
function resumable(cwd: string): RunSession {
  const saved = readSession(cwd);
  if (saved === undefined) throw new ProgressError("no run to resume: no run saved a session; start one with oid run");
  if (saved.state === STATE.done) throw new ProgressError(`the run ${saved.runId} is done: nothing to resume`);
  if (START_STATES.includes(saved.state)) throw new ProgressError(`the run ${saved.runId} stopped at ${saved.state}, before its features were selected, and cannot be resumed: start a new run with oid run`);
  return saved;
}

/** Discards what the run left after its last checkpoint and returns the files it discarded. */
function discardUncommitted(workspace: Workspace): string[] {
  const files = uncommittedFiles(workspace.path);
  rollback(workspace, headCommit(workspace.path), EVERY_FILE);
  return files;
}

/** The target features that are done in the progress file of the worktree. */
function doneIn(worktree: string): string[] {
  return loadProgress(worktree, loadProjectConfig(worktree).paths.progress).features.filter(({ status }) => status === FEATURE_STATUS.done).map(({ id }) => id);
}

/** Resumes the run the session saved, after a crash, an abort or a question it could not ask: takes the lock (releasing one whose process is gone), returns the worktree to its last checkpoint (the feature files that wait for their review stay) and runs again the state it stopped in. Returns the exit code of the process. */
export async function resumeRun(cwd: string, environment: { write: (text: string) => void }, services: RunServices): Promise<number> {
  await requireSetup(cwd, services.preflight);
  const saved = resumable(cwd);
  const released = takeOverLock(cwd, services.pid);
  try {
    if (!existsSync(saved.worktree)) throw new ProgressError(`the worktree of the run ${saved.runId} is gone: ${saved.worktree}`);
    const bus = createEventBus({ cwd, runId: saved.runId, write: environment.write, stopRequested: services.aborted });
    const workspace = { path: saved.worktree, branch: saved.branch, startCommit: saved.baseCommit };
    const discarded = saved.state === STATE.featureReview ? [] : discardUncommitted(workspace);
    updateSession(cwd, { pendingInput: null });
    bus.emit({ type: RESUMED, state: saved.state, discarded, ...(released === undefined ? {} : { releasedLock: released }) });
    const plan = resumePlan(saved, doneIn(workspace.path));
    const started: Started = { cwd, runId: saved.runId, bus, workspace, targets: plan.targets };
    return await endOnGitFailure(bus, () => ("review" in plan ? writeAndReview(started, services, plan.review) : runInnerLoop(started, services, saved.featureHashes ?? {}, plan)));
  } catch (error) {
    if (error instanceof RunStopped) return error.code;
    throw error;
  } finally {
    releaseLock(cwd);
  }
}
