import { checkpoint } from "../artifacts/git-checkpoints.js";
import { advanceStep, CYCLE_STEP, recordGuard, recordScenario, SCENARIO_STATUS } from "../artifacts/progress.js";
import { clearReturn } from "../artifacts/return-record.js";
import { GUARD_ACCEPTED } from "../events/types.js";
import { type Started, STATE, transition } from "./begin.js";
import { updateSession } from "./session.js";
import { scenariosLeft } from "./wip-tag.js";
import { moveRunTo, updateFeature } from "./worktree-progress.js";

/** What follows a guard: another scenario, or the quality gate when none is left. */
export const AFTER_GUARD = { next: "next", last: "last" } as const;

/** A full stop and the spaces after a person's reason, which would read badly before the "; ..." that follows it in the transition. */
const TRAILING_STOP = /\.?\s*$/;

/** Records a scenario that a person accepted as a guard (ADR-049): it passes, with their reason, and needs no unit test, so the run goes on with the next scenario, or with the quality gate, and never to TDD Red for this one. The steps are checkpointed and the reason goes to the event log. */
export function acceptGuard(started: Started, scenario: { name: string; names: string[]; reason: string }): typeof AFTER_GUARD[keyof typeof AFTER_GUARD] {
  const { cwd, bus, workspace, targets } = started;
  const [fr] = targets as [string];
  let moreToDo = false;
  updateFeature(workspace.path, fr, (feature) => {
    const known = feature.scenarios ?? [];
    const registered = scenario.names.filter((name) => !known.some((existing) => existing.name === name)).reduce((moved, name) => recordScenario(moved, name, SCENARIO_STATUS.pending), feature);
    const recorded = recordGuard(registered, scenario.name, scenario.reason);
    moreToDo = scenariosLeft(workspace.path, recorded);
    return moreToDo ? moveRunTo(recorded, CYCLE_STEP.bddRed) : advanceStep(recorded, CYCLE_STEP.qualityGate, [CYCLE_STEP.qualityGate]);
  });
  clearReturn(workspace.path, fr);
  checkpoint(workspace, { fr, state: STATE.bddRed, scenario: scenario.name });
  bus.emit({ type: GUARD_ACCEPTED, fr, scenario: scenario.name, reason: scenario.reason });
  const next = moreToDo ? STATE.bddRed : STATE.qualityGate;
  updateSession(cwd, { state: next });
  transition(bus, STATE.bddRed, next, `the scenario "${scenario.name}" passes before any code and the person accepted it as a guard: ${scenario.reason.replace(TRAILING_STOP, "")}${moreToDo ? "; the next scenario is next" : `; every scenario of ${fr} passes, the quality gate is next`}`);
  return moreToDo ? AFTER_GUARD.next : AFTER_GUARD.last;
}
