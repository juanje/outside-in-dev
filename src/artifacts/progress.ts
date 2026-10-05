import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const PROGRESS_FILE = "progress.json";

export interface ScenarioProgress {
  name: string;
  bdd: string;
}

export interface FeatureProgress {
  id: string;
  title: string;
  status: string;
  cycle_step?: string;
  scenarios?: ScenarioProgress[];
}

export interface Progress {
  current_focus: string | null;
  features: FeatureProgress[];
}

/** An error whose message is meant to be shown to the user as is. */
export class ProgressError extends Error {}

export function loadProgress(cwd: string): Progress {
  const path = join(cwd, PROGRESS_FILE);
  if (!existsSync(path)) {
    throw new ProgressError(`${PROGRESS_FILE} not found in ${cwd}`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as Progress;
}

/** Writes the file atomically: a temporary file in the same directory, then a rename. */
export function saveProgress(cwd: string, progress: Progress): void {
  const path = join(cwd, PROGRESS_FILE);
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(progress, null, 2)}\n`);
  renameSync(temporary, path);
}

export function requireFeature(progress: Progress, id: string | undefined): FeatureProgress {
  const feature = progress.features.find((f) => f.id === id);
  if (!feature) throw new ProgressError(`${id} is not tracked in ${PROGRESS_FILE}`);
  return feature;
}

const SCENARIO_STATUSES = ["pass", "fail", "pending"];

const START_STEP = "select";

const NEXT_STEPS: Record<string, string[]> = {
  select: ["bdd_red"],
  bdd_red: ["tdd_red"],
  tdd_red: ["tdd_green"],
  tdd_green: ["refactor", "tdd_red", "bdd_red", "quality_gate"],
  refactor: ["tdd_red", "bdd_red", "quality_gate"],
};

/** Returns the feature moved to `step`; the input is not modified. */
export function advanceStep(feature: FeatureProgress, step: string): FeatureProgress {
  const from = feature.cycle_step ?? feature.status;
  const allowed = feature.status === "pending" ? [START_STEP] : (NEXT_STEPS[from] ?? []);
  if (!allowed.includes(step)) {
    throw new ProgressError(`cannot move ${feature.id} from ${from} to ${step}`);
  }
  return { ...feature, status: "in_progress", cycle_step: step, scenarios: feature.scenarios ?? [] };
}

/** Returns the feature with the scenario's status set, appending the scenario if needed; the input is not modified. */
export function recordScenario(feature: FeatureProgress, name: string, bdd: string): FeatureProgress {
  if (!SCENARIO_STATUSES.includes(bdd)) {
    throw new ProgressError(`invalid scenario status "${bdd}": use pass, fail or pending`);
  }
  if (feature.status === "pending") {
    throw new ProgressError(`${feature.id} has not started and cannot hold scenarios`);
  }
  const existing = feature.scenarios ?? [];
  const scenarios = existing.some((s) => s.name === name)
    ? existing.map((s) => (s.name === name ? { name, bdd } : s))
    : [...existing, { name, bdd }];
  return { ...feature, scenarios };
}
