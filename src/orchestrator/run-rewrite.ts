import { rollback } from "../artifacts/git-checkpoints.js";
import { loadProjectConfig } from "../artifacts/project-config.js";
import { type Started, STATE, transition } from "./begin.js";
import type { Redirect } from "./redirect.js";
import type { LoopEntry } from "./run-inner-loop.js";
import { savedScenario } from "./saved-scenario.js";
import { readSession, updateSession } from "./session.js";

/** Writes the last unit test again: returns the run to where the last TDD Red started, takes that test out of the session and gives the inner loop the entry that has TDD Red run with the person's note. */
export function rewriteLastTest({ cwd, bus, workspace }: Started, { reason, note }: Redirect): LoopEntry {
  const saved = readSession(cwd)!;
  const { commit, tests } = saved.beforeTddRed!;
  const { paths } = loadProjectConfig(workspace.path);
  rollback(workspace, commit, [...paths.source, ...paths.unit_tests, ...paths.bdd_steps]);
  const scenario = savedScenario(saved);
  updateSession(cwd, { state: STATE.tddRed, unitRed: undefined, beforeGreen: undefined, scenarioUnitTests: { ...saved.scenarioUnitTests, [scenario.current.name]: tests } });
  transition(bus, saved.state, STATE.tddRed, `${scenario.label}: the person asked for the last unit test to be written again${note === "" ? "" : ` (${note})`}: ${reason}`);
  return { state: STATE.tddRed, red: scenario, iteration: saved.innerIteration, note };
}
