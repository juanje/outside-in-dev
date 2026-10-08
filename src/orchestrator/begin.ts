import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { writeFileAtomic } from "../artifacts/atomic-write.js";
import { readRequirementIds } from "../artifacts/spec.js";
import { startRun, type Workspace } from "../artifacts/git-workspace.js";
import { loadProgress, ProgressError } from "../artifacts/progress.js";
import { loadProjectConfig, type ProjectConfig } from "../artifacts/project-config.js";
import { createEventBus } from "../events/bus.js";
import { ERROR_EVENT, WAITING_INPUT } from "../events/types.js";
import { BDD_RED, TDD_RED } from "../agents/profiles.js";
import { acquireLock, releaseLock } from "./lock.js";
import { runDirectory, startSession, updateSession } from "./session.js";
import { LIST_SEPARATOR } from "../ui/plain.js";
import { selectTargets } from "./select.js";
import { runSuite, type SuiteResult } from "./suite.js";
import type { RunArgs } from "./run-args.js";
import { newRunId } from "./run-id.js";

/** What a run takes from its surroundings, so a test can fix it. */
export type RunEnvironment = { pid: number; now: Date; suffix: string; write: (text: string) => void };

/** The states of the orchestrator that a start goes through (design section 6.1). */
export const STATE = { idle: "IDLE", preflight: "PREFLIGHT", baseline: "BASELINE", specCheck: "SPEC_CHECK", selectFr: "SELECT_FR", featureWrite: "FEATURE_WRITE", featureReview: "FEATURE_REVIEW", bddRed: BDD_RED, tddRed: TDD_RED, done: "DONE" } as const;

type Bus = ReturnType<typeof createEventBus>;

/** What a start that selected features hands to the states after it. */
export type Started = { cwd: string; runId: string; bus: Bus; workspace: Workspace; targets: string[] };

/** Publishes the move of the run from one state to the next. */
export function transition(bus: Bus, from: string, to: string, reason: string): number | undefined {
  return bus.emit({ type: "state_change", from, to, reason });
}

/** Records the baseline of the run, what the suite showed at the start, and keeps the reports it came from. */
function recordBaseline(cwd: string, runId: string, workspace: Workspace, suite: SuiteResult): void {
  const run = runDirectory(cwd, runId);
  const unitReport = join(run, "tests/0-unit.json");
  mkdirSync(dirname(unitReport), { recursive: true });
  writeFileAtomic(join(run, "baseline.json"), `${JSON.stringify({ startCommit: workspace.startCommit, unit: { failed: suite.unit }, bdd: { failed: suite.bdd } })}\n`);
  writeFileAtomic(unitReport, suite.reports.unit);
  writeFileAtomic(join(run, "tests/0-bdd.ndjson"), suite.reports.bdd);
}

const RED_SUITE_ACTIONS = ["view", "continue", "abort"].map((key) => ({ key, label: key }));

/** Asks what to do with the failures the suite already had: an inherited failure cannot be told apart from a new one. Returns the exit code the question ends the process with. */
function askAboutRedSuite(bus: Bus, suite: SuiteResult): number {
  const prompt = `The existing suite is red: ${suite.unit.length} failing unit tests and ${suite.bdd.length} failing scenarios`;
  return bus.emit({ type: WAITING_INPUT, request: { id: "red-suite", prompt, actions: RED_SUITE_ACTIONS } }) ?? 0;
}

/** What a run carries from one state of the start to the next. */
type Start = { cwd: string; args: RunArgs; runId: string; bus: Bus; commands: ProjectConfig["commands"]; now: Date };

/** Goes through the states of the start, from the worktree to the selection: returns the exit code of the process when the start ends the run, else what the next states need. */
function goThroughStart({ cwd, args, runId, bus, commands, now }: Start): number | Started {
  transition(bus, STATE.idle, STATE.preflight, "run started");
  const workspace = startRun(cwd, { runId, name: args.branch, now });
  startSession(cwd, { runId, worktree: workspace.path, branch: workspace.branch, baseCommit: workspace.startCommit, state: STATE.baseline });
  transition(bus, STATE.preflight, STATE.baseline, "worktree ready");
  const suite = runSuite(workspace.path, commands);
  recordBaseline(cwd, runId, workspace, suite);
  if (suite.unit.length + suite.bdd.length > 0) return askAboutRedSuite(bus, suite);
  transition(bus, STATE.baseline, STATE.specCheck, "the suite is green");
  const targets = selectTargets(args, readRequirementIds(workspace.path), loadProgress(workspace.path));
  transition(bus, STATE.specCheck, STATE.selectFr, "the targets are valid");
  if (targets.length === 0) {
    transition(bus, STATE.selectFr, STATE.done, "no pending features");
    return 0;
  }
  transition(bus, STATE.selectFr, STATE.featureWrite, `start finished; selected ${targets.join(LIST_SEPARATOR)} wait for feature writing`);
  updateSession(cwd, { state: STATE.featureWrite, targetFrs: targets });
  return { cwd, runId, bus, workspace, targets };
}

/** Whether the value is the exit code of a process, as opposed to what the next states need. */
export function isExitCode(value: unknown): value is number {
  return typeof value === "number";
}

/** Starts the run with the lock held: returns the exit code of the process when the start ends the run, else what the next states need. A failure once the run has started is an event of the run. */
export function startOfRun(cwd: string, args: RunArgs, environment: RunEnvironment, commands: ProjectConfig["commands"]): number | Started {
  const runId = newRunId(environment.now, environment.suffix);
  const bus = createEventBus({ cwd, runId, write: environment.write, now: () => environment.now.getTime() });
  try {
    return goThroughStart({ cwd, args, runId, bus, commands, now: environment.now });
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
