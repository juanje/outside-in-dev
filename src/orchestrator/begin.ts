import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { writeFileAtomic } from "../artifacts/atomic-write.js";
import { findingKey } from "../artifacts/baseline.js";
import type { Detector } from "../artifacts/detect-all.js";
import { readRequirementIds } from "../artifacts/spec.js";
import { startRun, type Workspace } from "../artifacts/git-workspace.js";
import { loadProgress, ProgressError } from "../artifacts/progress.js";
import { loadProjectConfig, type ProjectConfig } from "../artifacts/project-config.js";
import { createEventBus } from "../events/bus.js";
import { ABORTED, ERROR_EVENT, STATE_CHANGE, WAITING_INPUT } from "../events/types.js";
import { BDD_RED, CODE_GREEN, QUALITY_FIX, REFACTOR, TDD_RED } from "../agents/profiles.js";
import { gateBaseline } from "./gate-baseline.js";
import type { GateBaseline } from "./gate-checks.js";
import { acquireLock, releaseLock } from "./lock.js";
import { runDirectory, startSession, updateSession } from "./session.js";
import { LIST_SEPARATOR } from "../ui/plain.js";
import { selectTargets } from "./select.js";
import { REAL_RUNNERS, type Runners } from "../artifacts/verify-runner.js";
import { runSuite, type SuiteResult } from "./suite.js";
import type { RunArgs } from "./run-args.js";
import { newRunId } from "./run-id.js";
import { RunStopped } from "./run-stopped.js";

/** What a run takes from its surroundings, so a test can fix it. */
export type RunEnvironment = { pid: number; now: Date; suffix: string; write: (text: string) => void; aborted?: () => boolean };

/** The states of the orchestrator that a start goes through (design section 6.1). */
export const STATE = { idle: "IDLE", preflight: "PREFLIGHT", baseline: "BASELINE", specCheck: "SPEC_CHECK", selectFr: "SELECT_FR", featureWrite: "FEATURE_WRITE", featureReview: "FEATURE_REVIEW", bddRed: BDD_RED, tddRed: TDD_RED, codeGreen: CODE_GREEN, refactor: REFACTOR, bddCheck: "BDD_CHECK", qualityGate: "QUALITY_GATE", qualityFix: QUALITY_FIX, frCommit: "FR_COMMIT", aborted: ABORTED, done: "DONE" } as const;

type Bus = ReturnType<typeof createEventBus>;

/** What a start that selected features hands to the states after it. */
export type Started = { cwd: string; runId: string; bus: Bus; workspace: Workspace; targets: string[] };

/** Publishes the move of the run from one state to the next. When someone asked the run to stop, a move into a state that does not end the run is followed by the move to ABORTED, and the run stops there (it throws `RunStopped`): the step that was in progress is done and the session names the state that comes next. */
export function transition(bus: Bus, from: string, to: string, reason: string): number | undefined {
  const code = bus.emit({ type: STATE_CHANGE, from, to, reason });
  if (to === STATE.aborted || to === STATE.done || bus.stopRequested?.() !== true) return code;
  throw new RunStopped(bus.emit({ type: STATE_CHANGE, from: to, to: STATE.aborted, reason: "the run was aborted (oid abort) after the step it was in" }) ?? 1);
}

/** Records the baseline of the run, what the suite showed at the start and, when detectors ran, the identity of the findings they reported, and keeps the reports the suite came from. */
function recordBaseline(cwd: string, runId: string, workspace: Workspace, suite: SuiteResult, gate: GateBaseline | undefined, findings?: string[]): void {
  const run = runDirectory(cwd, runId);
  const unitReport = join(run, "tests/0-unit.json");
  mkdirSync(dirname(unitReport), { recursive: true });
  writeFileAtomic(join(run, "baseline.json"), `${JSON.stringify({ startCommit: workspace.startCommit, unit: { failed: suite.unit }, bdd: { failed: suite.bdd }, ...gate, ...(findings === undefined ? {} : { findings }) })}\n`);
  writeFileAtomic(unitReport, suite.reports.unit);
  writeFileAtomic(join(run, "tests/0-bdd.ndjson"), suite.reports.bdd);
}

const RED_SUITE_ACTIONS = ["view", "continue", "abort"].map((key) => ({ key, label: key }));

/** Asks what to do with the failures the suite already had, naming each (a failing test or scenario, or a runner that failed with a report that names none): an inherited failure cannot be told apart from a new one. Returns the exit code the question ends the process with. */
function askAboutRedSuite(bus: Bus, suite: SuiteResult): number {
  const prompt = `The existing suite is red: ${[...suite.unit, ...suite.bdd].join(LIST_SEPARATOR)}`;
  return bus.emit({ type: WAITING_INPUT, request: { id: "red-suite", prompt, actions: RED_SUITE_ACTIONS } }) ?? 0;
}

/** What a run carries from one state of the start to the next. */
type Start = { cwd: string; args: RunArgs; runId: string; bus: Bus; commands: ProjectConfig["commands"]; now: Date; detect?: Detector; runners: Runners };

/** Goes through the states of the start, from the worktree to the selection: returns the exit code of the process when the start ends the run, else what the next states need. */
function goThroughStart({ cwd, args, runId, bus, commands, now, detect, runners }: Start): number | Started {
  transition(bus, STATE.idle, STATE.preflight, "run started");
  const workspace = startRun(cwd, { runId, name: args.branch, now });
  startSession(cwd, { runId, worktree: workspace.path, branch: workspace.branch, baseCommit: workspace.startCommit, state: STATE.baseline });
  transition(bus, STATE.preflight, STATE.baseline, "worktree ready");
  const suite = runSuite(workspace.path, commands, runners);
  const suiteIsGreen = suite.unit.length + suite.bdd.length === 0;
  const gate = suiteIsGreen ? gateBaseline(workspace.path, loadProjectConfig(workspace.path), runners) : undefined;
  recordBaseline(cwd, runId, workspace, suite, gate, suiteIsGreen && detect !== undefined ? detect(workspace.path).map(findingKey) : undefined);
  if (!suiteIsGreen) return askAboutRedSuite(bus, suite);
  transition(bus, STATE.baseline, STATE.specCheck, "the suite is green");
  const targets = selectTargets(args, readRequirementIds(workspace.path), loadProgress(workspace.path));
  transition(bus, STATE.specCheck, STATE.selectFr, "the targets are valid");
  if (targets.length === 0) {
    transition(bus, STATE.selectFr, STATE.done, "no pending features");
    return 0;
  }
  updateSession(cwd, { state: STATE.featureWrite, targetFrs: targets, featureStart: workspace.startCommit });
  transition(bus, STATE.selectFr, STATE.featureWrite, `start finished; selected ${targets.join(LIST_SEPARATOR)} wait for feature writing`);
  return { cwd, runId, bus, workspace, targets };
}

/** Whether the value is the exit code of a process, as opposed to what the next states need. */
export function isExitCode(value: unknown): value is number {
  return typeof value === "number";
}

/** Starts the run with the lock held: returns the exit code of the process when the start ends the run, else what the next states need. A failure once the run has started is an event of the run. */
export function startOfRun(cwd: string, args: RunArgs, environment: RunEnvironment, commands: ProjectConfig["commands"], detect?: Detector, runners: Runners = REAL_RUNNERS): number | Started {
  const runId = newRunId(environment.now, environment.suffix);
  const bus = createEventBus({ cwd, runId, write: environment.write, now: () => environment.now.getTime(), stopRequested: environment.aborted });
  try {
    return goThroughStart({ cwd, args, runId, bus, commands, now: environment.now, detect, runners });
  } catch (error) {
    if (!(error instanceof ProgressError)) throw error;
    return bus.emit({ type: ERROR_EVENT, message: error.message }) ?? 1;
  }
}

/** Starts a run in the project `cwd`: returns the exit code of the process. */
export function beginRun(cwd: string, args: RunArgs, environment: RunEnvironment): number {
  const { commands } = loadProjectConfig(cwd);
  acquireLock(cwd, environment.pid);
  try {
    const started = startOfRun(cwd, args, environment, commands);
    return isExitCode(started) ? started : 0;
  } finally {
    releaseLock(cwd);
  }
}
