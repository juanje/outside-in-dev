import { CYCLE_STEP, FEATURE_STATUS, SCENARIO_STATUS, type FeatureProgress, type Progress } from "./progress.js";

export interface TaggedScenario {
  name: string;
  tags: string[];
}

export interface ProgressViolation {
  feature: string;
  scenario?: string;
  kind: string;
}

function checkFocus(progress: Progress): ProgressViolation[] {
  const focus = progress.current_focus;
  if (focus === null) return [];
  const focused = progress.features.find((f) => f.id === focus);
  if (!focused) return [{ feature: focus, kind: "focused but not tracked" }];
  return focused.status === FEATURE_STATUS.inProgress ? [] : [{ feature: focus, kind: `focused but status is ${focused.status}` }];
}

/** The names of the scenarios tagged with `feature` that its progress does not record, in the order given. */
export function unrecordedScenarios(feature: FeatureProgress, scenarios: TaggedScenario[]): string[] {
  const recorded = (feature.scenarios ?? []).map(({ name }) => name);
  return scenarios.filter(({ name, tags }) => tags.includes(`@${feature.id}`) && !recorded.includes(name)).map(({ name }) => name);
}

function checkFeature(feature: FeatureProgress, scenarios: TaggedScenario[]): ProgressViolation[] {
  const violations: ProgressViolation[] = [];
  const tag = `@${feature.id}`;
  const recorded = feature.scenarios ?? [];
  if (feature.status === FEATURE_STATUS.done) {
    for (const { name, bdd } of recorded.filter((s) => s.bdd !== SCENARIO_STATUS.pass)) {
      violations.push({ feature: feature.id, scenario: name, kind: `done but scenario is ${bdd}` });
    }
  }
  const started = feature.status !== FEATURE_STATUS.pending && feature.cycle_step !== CYCLE_STEP.select;
  if (started && !scenarios.some(({ tags }) => tags.includes(tag))) {
    violations.push({ feature: feature.id, kind: "started but no feature file tags it" });
  }
  for (const { name } of recorded) {
    if (!scenarios.some((s) => s.name === name && s.tags.includes(tag))) {
      violations.push({
        feature: feature.id,
        scenario: name,
        kind: "recorded scenario is in no feature file tagged with the feature",
      });
    }
  }
  return violations;
}

/** Reports progress that contradicts the feature files; `scenarios` carry their effective tags. */
export function checkProgressConsistency(progress: Progress, scenarios: TaggedScenario[]): ProgressViolation[] {
  return [...checkFocus(progress), ...progress.features.flatMap((feature) => checkFeature(feature, scenarios))];
}
