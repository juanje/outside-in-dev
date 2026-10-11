import { checkpoint } from "../artifacts/git-checkpoints.js";
import { squashFeature } from "../artifacts/git-squash.js";
import { completeFeature, loadProgress, SCENARIO_STATUS } from "../artifacts/progress.js";
import { loadProjectConfig } from "../artifacts/project-config.js";
import { listLocatedScenarios, readFeatureSources } from "../artifacts/traceability.js";
import { type Started, STATE } from "./begin.js";
import { readSession } from "./session.js";
import { updateFeature } from "./worktree-progress.js";

/** The feature files of the targets that come after the first one: they stay out of its commit. */
export function laterFeatureFiles(worktree: string, later: string[]): string[] {
  const { paths } = loadProjectConfig(worktree);
  const scenarios = listLocatedScenarios(readFeatureSources(worktree, paths.bdd_features));
  return [...new Set(scenarios.filter(({ tags }) => later.some((fr) => tags.includes(`@${fr}`))).map(({ file }) => file))];
}

/** The scenarios the run skipped for the feature, with the reason and the ref that holds the partial work of each. */
export function skippedOf(cwd: string, fr: string) {
  return (readSession(cwd)?.skippedScenarios ?? []).filter((skipped) => skipped.fr === fr);
}

/** Commits the first target: marks it done in the progress file of the worktree, checkpoints that and replaces the checkpoints since `from` with one commit, which leaves out the feature files of the other targets. A feature with skipped scenarios is not done: it stays in progress, and its commit is a `wip` commit that lists them. Returns the commit. */
export function commitFeature({ cwd, workspace, targets }: Started, from: string): string {
  const [fr, ...later] = targets;
  const worktree = workspace.path;
  const skipped = skippedOf(cwd, fr!);
  if (skipped.length === 0) updateFeature(worktree, fr!, completeFeature);
  checkpoint(workspace, { fr: fr!, state: STATE.frCommit });
  const { title, scenarios = [] } = loadProgress(worktree, loadProjectConfig(worktree).paths.progress).features.find(({ id }) => id === fr)!;
  const passing = scenarios.filter(({ bdd }) => bdd === SCENARIO_STATUS.pass).map(({ name }) => name);
  return squashFeature(workspace, { startCommit: from, id: fr!, title, scenarios: passing, leave: laterFeatureFiles(worktree, later), ...(skipped.length === 0 ? {} : { type: "wip", skipped }) });
}
