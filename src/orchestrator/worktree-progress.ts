import { type FeatureProgress, loadProgress, saveProgress } from "../artifacts/progress.js";
import { loadProjectConfig } from "../artifacts/project-config.js";

/** Changes one feature in the progress file of the worktree. */
export function updateFeature(worktree: string, fr: string, change: (feature: FeatureProgress) => FeatureProgress): void {
  const file = loadProjectConfig(worktree).paths.progress;
  const progress = loadProgress(worktree, file);
  saveProgress(worktree, { ...progress, features: progress.features.map((feature) => (feature.id === fr ? change(feature) : feature)) }, file);
}
