import { NEWLINE } from "../artifacts/lines.js";
import { type FeatureProgress, SCENARIO_STATUS } from "../artifacts/progress.js";
import { loadProjectConfig } from "../artifacts/project-config.js";
import { type LocatedScenario, listLocatedScenarios, readFeatureSources } from "../artifacts/traceability.js";

/** The tag of a scenario that was skipped: it is left out of regression. */
export const WIP_TAG = "@wip";

/** The scenarios of a requirement that are left to do, in file order: those tagged with it that do not pass and are not skipped (tagged `@wip`). */
export function unfinishedScenarios(located: LocatedScenario[], fr: string, passing: string[]): LocatedScenario[] {
  return located.filter(({ tags, name }) => tags.includes(`@${fr}`) && !tags.includes(WIP_TAG) && !passing.includes(name));
}

/** Whether the requirement of the feature has scenarios left to do in the feature files of the worktree, given the scenarios that the feature records as passing. */
export function scenariosLeft(worktree: string, feature: FeatureProgress): boolean {
  const passing = (feature.scenarios ?? []).filter(({ bdd }) => bdd === SCENARIO_STATUS.pass).map(({ name }) => name);
  const located = listLocatedScenarios(readFeatureSources(worktree, loadProjectConfig(worktree).paths.bdd_features));
  return unfinishedScenarios(located, feature.id, passing).length > 0;
}

/** The text of a feature file with a `@wip` line above the scenario that starts at `line` (counted from 1), in the indentation of that scenario; nothing else changes. */
export function tagWip(text: string, line: number): string {
  const lines = text.split(NEWLINE);
  const indentation = /^\s*/.exec(lines[line - 1]!)![0];
  lines.splice(line - 1, 0, `${indentation}${WIP_TAG}`);
  return lines.join(NEWLINE);
}
