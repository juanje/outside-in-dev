import { advanceStep, type FeatureProgress, loadProgress, saveProgress } from "../artifacts/progress.js";
import { loadProjectConfig } from "../artifacts/project-config.js";

/** The feature moved to the step by a run; a feature that is already there stays as it is, because a run may come back to a state with the step it left (`oid progress step` stays strict). */
export function moveRunTo(feature: FeatureProgress, step: string): FeatureProgress {
  return feature.cycle_step === step ? feature : advanceStep(feature, step);
}

/** Changes one feature in the progress file of the worktree. */
export function updateFeature(worktree: string, fr: string, change: (feature: FeatureProgress) => FeatureProgress): void {
  const file = loadProjectConfig(worktree).paths.progress;
  const progress = loadProgress(worktree, file);
  saveProgress(worktree, { ...progress, features: progress.features.map((feature) => (feature.id === fr ? change(feature) : feature)) }, file);
}
