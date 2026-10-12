import { codeSince } from "../artifacts/cycle-code.js";
import { rollback } from "../artifacts/git-checkpoints.js";
import { git, GitError, headCommit } from "../artifacts/git-workspace.js";
import { CYCLE_STEP, loadProgress } from "../artifacts/progress.js";
import { loadProjectConfig } from "../artifacts/project-config.js";
import { recordReturn } from "../artifacts/return-record.js";
import { isInsideSource } from "../artifacts/source-roots.js";
import { type Started, STATE, transition } from "./begin.js";
import type { Redirect } from "./redirect.js";
import type { LoopEntry } from "./run-inner-loop.js";
import { savedScenario } from "./saved-scenario.js";
import { readSession, updateSession } from "./session.js";
import { moveRunTo, updateFeature } from "./worktree-progress.js";

/** Goes back to the start of the scenario but keeps the step definitions as they are now, for the writer to start from. */
function restartScenario({ workspace }: Started, start: string, stepGlobs: string[], globs: string[]): void {
  const current = headCommit(workspace.path);
  rollback(workspace, start, globs);
  try {
    git(workspace.path, `checkout ${current} --`, ...stepGlobs.map((glob) => `:(glob)${glob}`));
  } catch (error) {
    if (!(error instanceof GitError)) throw error;
  }
}

/** Has the steps of the scenario written again: the half-done attempt of the state that asked is dropped; with code written for the scenario since its start the code stays and the steps are judged with and without it, without any code the scenario starts again from its start (its unit tests go), with the step definitions it has. Returns the entry that has BDD Red run with the person's note. */
export function rewriteSteps(started: Started, { reason, note }: Redirect): LoopEntry {
  const { cwd, bus, workspace, targets } = started;
  const saved = readSession(cwd)!;
  const scenario = savedScenario(saved);
  const [fr] = targets as [string];
  const { paths } = loadProjectConfig(workspace.path);
  const everything = [...paths.source, ...paths.unit_tests, ...paths.bdd_steps];
  rollback(workspace, headCommit(workspace.path), everything);
  const start = saved.scenarioStart!;
  const hadCode = codeSince(workspace.path, start, (name) => isInsideSource(paths.source, name)).length > 0;
  const origin = loadProgress(workspace.path, paths.progress).features.find(({ id }) => id === fr)?.cycle_step ?? CYCLE_STEP.tddRed;
  if (!hadCode) restartScenario(started, start, paths.bdd_steps, everything);
  updateFeature(workspace.path, fr, (feature) => moveRunTo(feature, CYCLE_STEP.bddRed));
  recordReturn(workspace.path, fr, origin);
  const otherTests = Object.fromEntries(Object.entries(saved.scenarioUnitTests ?? {}).filter(([name]) => name !== scenario.current.name));
  updateSession(cwd, { state: STATE.bddRed, unitRed: undefined, beforeGreen: undefined, beforeTddRed: undefined, ...(hadCode ? {} : { innerIteration: 1, scenarioUnitTests: otherTests }) });
  transition(bus, saved.state, STATE.bddRed, `${scenario.label}: the person asked for the steps to be written again${note === "" ? "" : ` (${note})`}: ${reason}`);
  return { state: STATE.bddRed, red: scenario, iteration: saved.innerIteration, steps: { note, failure: scenario.failure, ...(hadCode ? { base: start } : {}) } };
}
