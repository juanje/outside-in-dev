import { type Progress, SCENARIO_STATUS } from "./progress.js";
import type { LocatedScenario } from "./traceability.js";

export interface ScenarioLocation {
  file: string;
  line: number;
  name: string;
}

/** A scenario located in a feature file, with the feature it is recorded under. */
export interface FeatureScenarioLocation extends ScenarioLocation {
  feature: string;
}

/** A scenario recorded as passing that no scenario tagged with its feature has the name of any more. */
export interface MissingScenario {
  feature: string;
  name: string;
}

/** The location of every scenario that progress records as passing, found by its name among the scenarios tagged with its feature; and those that cannot be found. */
export function locatePassingScenarios(progress: Progress, located: LocatedScenario[]): { found: FeatureScenarioLocation[]; missing: MissingScenario[] } {
  const found: FeatureScenarioLocation[] = [];
  const missing: MissingScenario[] = [];
  for (const feature of progress.features) {
    for (const { name } of (feature.scenarios ?? []).filter((scenario) => scenario.bdd === SCENARIO_STATUS.pass)) {
      const match = located.find((candidate) => candidate.name === name && candidate.tags.includes(`@${feature.id}`));
      if (match === undefined) missing.push({ feature: feature.id, name });
      else found.push({ feature: feature.id, file: match.file, line: match.line, name });
    }
  }
  return { found, missing };
}
