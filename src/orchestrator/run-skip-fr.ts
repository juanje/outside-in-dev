import { existsSync } from "node:fs";
import { join } from "node:path";
import { checkpoint, EVERY_FILE, rollback } from "../artifacts/git-checkpoints.js";
import { git, headCommit } from "../artifacts/git-workspace.js";
import { loadProgress, saveProgress, FEATURE_STATUS } from "../artifacts/progress.js";
import { loadProjectConfig } from "../artifacts/project-config.js";
import { type Started, STATE, transition } from "./begin.js";
import type { Redirect } from "./redirect.js";
import { laterFeatureFiles } from "./run-commit.js";
import { readSession, updateSession } from "./session.js";

/** Skips the first target feature: the run returns to where the feature started, keeping the feature files of the targets that come after it and their progress, the feature goes back to pending (no cycle step, no scenarios), and the reason goes to the event log. The run then goes on with the next target, or ends. */
export function skipFeature({ cwd, bus, workspace, targets }: Started, from: string, { reason }: Redirect): void {
  const [fr, ...later] = targets as [string, ...string[]];
  const worktree = workspace.path;
  const saved = readSession(cwd)!;
  const file = loadProjectConfig(worktree).paths.progress;
  const progress = loadProgress(worktree, file);
  const kept = laterFeatureFiles(worktree, later);
  const head = headCommit(worktree);
  rollback(workspace, from, EVERY_FILE);
  if (kept.length > 0) git(worktree, `checkout ${head} --`, ...kept);
  const restored = loadProgress(worktree, file);
  const features = restored.features.map((feature) => (feature.id === fr ? { id: feature.id, title: feature.title, status: FEATURE_STATUS.pending } : (later.includes(feature.id) && progress.features.find(({ id }) => id === feature.id)) || feature));
  if (JSON.stringify(features) !== JSON.stringify(restored.features)) saveProgress(worktree, { ...restored, features }, file);
  checkpoint(workspace, { fr, state: "SKIP_FR" });
  const next = later[0] === undefined ? STATE.done : STATE.bddRed;
  const featureHashes = Object.fromEntries(Object.entries(saved.featureHashes ?? {}).filter(([path]) => existsSync(join(worktree, path))));
  updateSession(cwd, { state: next, featureHashes, featureStart: from, leftFrs: [...(saved.leftFrs ?? []), fr] });
  transition(bus, saved.state, next, `${fr} is skipped (the person chose skip_fr) and goes back to pending; its changes are discarded${later[0] === undefined ? "" : `; ${later[0]} is next`}: ${reason}`);
}
