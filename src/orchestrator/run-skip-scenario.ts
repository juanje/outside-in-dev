import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "../artifacts/atomic-write.js";
import { hashFile } from "../artifacts/checkpoint.js";
import { checkpoint, shelveWork } from "../artifacts/git-checkpoints.js";
import { subjectFor } from "../artifacts/git-squash.js";
import { git } from "../artifacts/git-workspace.js";
import { NEWLINE } from "../artifacts/lines.js";
import { advanceStep, CYCLE_STEP, recordScenario, SCENARIO_STATUS } from "../artifacts/progress.js";
import { loadProjectConfig } from "../artifacts/project-config.js";
import { listLocatedScenarios, readFeatureSources } from "../artifacts/traceability.js";
import { type Started, STATE, transition } from "./begin.js";
import type { Redirect } from "./redirect.js";
import { readSession, updateSession } from "./session.js";
import { scenariosLeft, tagWip, WIP_TAG } from "./wip-tag.js";
import { moveRunTo, updateFeature } from "./worktree-progress.js";

/** The ref for the next scenario of the feature that the run sets aside: `refs/oid/wip/<run>/<feature>/<n>`. */
function nextRef(worktree: string, runId: string, fr: string): string {
  const prefix = `refs/oid/wip/${runId}/${fr}/`;
  return `${prefix}${git(worktree, "for-each-ref --format=%(refname)", prefix).split(NEWLINE).filter((line) => line !== "").length + 1}`;
}

/** Skips the current scenario: its partial work goes into a `wip` commit under a ref of the run and the run returns to where the scenario started; the scenario is tagged `@wip` (the one change oid makes to an approved feature file, with the hash the session keeps made again), recorded as pending, and the reason goes to the event log. Returns whether the feature has scenarios left (else the quality gate is next). */
export function skipScenario({ cwd, runId, bus, workspace, targets }: Started, { reason }: Redirect): boolean {
  const saved = readSession(cwd)!;
  const [fr] = targets as [string];
  const { name } = saved.scenario!;
  const worktree = workspace.path;
  const ref = nextRef(worktree, runId, fr);
  const subject = subjectFor(worktree, { id: fr, title: name, type: "wip" });
  shelveWork(workspace, { to: saved.scenarioStart!, ref, message: `${subject}${NEWLINE}${NEWLINE}${reason}` });
  const located = listLocatedScenarios(readFeatureSources(worktree, loadProjectConfig(worktree).paths.bdd_features)).find((scenario) => scenario.name === name && scenario.tags.includes(`@${fr}`))!;
  writeFileAtomic(join(worktree, located.file), tagWip(readFileSync(join(worktree, located.file), "utf8"), located.line));
  let left = false;
  updateFeature(worktree, fr, (feature) => {
    const registered = recordScenario(feature, name, SCENARIO_STATUS.pending);
    left = scenariosLeft(worktree, registered);
    return left ? moveRunTo(registered, CYCLE_STEP.bddRed) : advanceStep(registered, CYCLE_STEP.qualityGate, [CYCLE_STEP.qualityGate]);
  });
  checkpoint(workspace, { fr, state: "SKIP_SCENARIO", scenario: name });
  const next = left ? STATE.bddRed : STATE.qualityGate;
  updateSession(cwd, { state: next, featureHashes: { ...saved.featureHashes, [located.file]: `sha256:${hashFile(worktree, located.file)}` }, unitRed: undefined, beforeGreen: undefined, scenarioFailure: undefined, skippedScenarios: [...(saved.skippedScenarios ?? []), { fr, name, reason, ref }] });
  transition(bus, saved.state, next, `${fr} "${name}" is skipped and tagged ${WIP_TAG}; its partial work is kept under ${ref} (${subject}): ${reason}`);
  return left;
}
