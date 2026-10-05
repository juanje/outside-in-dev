import type { FeatureProgress, Progress } from "./progress.js";

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
  return focused.status === "in_progress" ? [] : [{ feature: focus, kind: `focused but status is ${focused.status}` }];
}

function checkFeature(feature: FeatureProgress, scenarios: TaggedScenario[]): ProgressViolation[] {
  const violations: ProgressViolation[] = [];
  const tag = `@${feature.id}`;
  const recorded = feature.scenarios ?? [];
  if (feature.status === "done") {
    for (const { name, bdd } of recorded.filter((s) => s.bdd !== "pass")) {
      violations.push({ feature: feature.id, scenario: name, kind: `done but scenario is ${bdd}` });
    }
  }
  const started = feature.status !== "pending" && feature.cycle_step !== "select";
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
