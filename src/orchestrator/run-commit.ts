import { checkpoint } from "../artifacts/git-checkpoints.js";
import { squashFeature } from "../artifacts/git-squash.js";
import { completeFeature, loadProgress } from "../artifacts/progress.js";
import { loadProjectConfig } from "../artifacts/project-config.js";
import { listLocatedScenarios, readFeatureSources } from "../artifacts/traceability.js";
import { type Started, STATE } from "./begin.js";
import { updateFeature } from "./worktree-progress.js";

/** The feature files of the targets that come after the first one: they stay out of its commit. */
function laterFeatureFiles(worktree: string, later: string[]): string[] {
  const { paths } = loadProjectConfig(worktree);
  const scenarios = listLocatedScenarios(readFeatureSources(worktree, paths.bdd_features));
  return [...new Set(scenarios.filter(({ tags }) => later.some((fr) => tags.includes(`@${fr}`))).map(({ file }) => file))];
}

/** Commits the first target: marks it done in the progress file of the worktree, checkpoints that and replaces the checkpoints since `from` with one commit, which leaves out the feature files of the other targets. Returns the commit. */
export function commitFeature({ workspace, targets }: Started, from: string): string {
  const [fr, ...later] = targets;
  const worktree = workspace.path;
  updateFeature(worktree, fr!, completeFeature);
  checkpoint(workspace, { fr: fr!, state: STATE.frCommit });
  const { title, scenarios = [] } = loadProgress(worktree, loadProjectConfig(worktree).paths.progress).features.find(({ id }) => id === fr)!;
  return squashFeature(workspace, { startCommit: from, id: fr!, title, scenarios: scenarios.map(({ name }) => name), leave: laterFeatureFiles(worktree, later) });
}
