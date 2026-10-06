import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "./atomic-write.js";

export const PROGRESS_FILE = "progress.json";

interface ScenarioProgress {
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

export function loadProgress(cwd: string, file: string = PROGRESS_FILE): Progress {
  const path = join(cwd, file);
  if (!existsSync(path)) {
    throw new ProgressError(`${file} not found in ${cwd}`);
  }
  let document: unknown;
  try {
    document = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new ProgressError(`${file} is not valid JSON: ${error.message}`);
  }
  requireValid(document, file);
  return document as Progress;
}

export function requireValid(document: unknown, file: string = PROGRESS_FILE): void {
  const violations = validateProgress(document);
  if (violations.length > 0) {
    throw new ProgressError(`${file} is invalid:\n${violations.map((v) => `  ${v}`).join("\n")}`);
  }
}

export function saveProgress(cwd: string, progress: Progress, file: string = PROGRESS_FILE): void {
  requireValid(progress, file);
  writeFileAtomic(join(cwd, file), `${JSON.stringify(progress, null, 2)}\n`);
}

export function requireFeature(progress: Progress, id: string | undefined, file: string = PROGRESS_FILE): FeatureProgress {
  const feature = progress.features.find((f) => f.id === id);
  if (!feature) throw new ProgressError(`${id} is not tracked in ${file}`);
  return feature;
}

/** The values of a feature's `status`. */
export const FEATURE_STATUS = { pending: "pending", inProgress: "in_progress", done: "done" } as const;
/** The values of a feature's `cycle_step`, in cycle order. */
export const CYCLE_STEP = {
  select: "select",
  bddRed: "bdd_red",
  tddRed: "tdd_red",
  tddGreen: "tdd_green",
  refactor: "refactor",
  qualityGate: "quality_gate",
} as const;
/** The values of a scenario's `bdd`. */
export const SCENARIO_STATUS = { pass: "pass", fail: "fail", pending: "pending" } as const;

const PASSING = SCENARIO_STATUS.pass;
export const SCENARIO_STATUSES: string[] = Object.values(SCENARIO_STATUS);

const START_STEP = CYCLE_STEP.select;

const NEXT_STEPS: Record<string, string[]> = {
  [CYCLE_STEP.select]: [CYCLE_STEP.bddRed],
  [CYCLE_STEP.bddRed]: [CYCLE_STEP.tddRed],
  [CYCLE_STEP.tddRed]: [CYCLE_STEP.tddGreen],
  [CYCLE_STEP.tddGreen]: [CYCLE_STEP.refactor, CYCLE_STEP.tddRed, CYCLE_STEP.bddRed, CYCLE_STEP.qualityGate],
  [CYCLE_STEP.refactor]: [CYCLE_STEP.tddRed, CYCLE_STEP.bddRed, CYCLE_STEP.qualityGate],
};

/** Returns the feature moved to `step`; the input is not modified. */
export function advanceStep(feature: FeatureProgress, step: string): FeatureProgress {
  const from = feature.cycle_step ?? feature.status;
  const allowed = feature.status === FEATURE_STATUS.pending ? [START_STEP] : (NEXT_STEPS[from] ?? []);
  if (!allowed.includes(step)) {
    throw new ProgressError(`cannot move ${feature.id} from ${from} to ${step}`);
  }
  return { ...feature, status: FEATURE_STATUS.inProgress, cycle_step: step, scenarios: feature.scenarios ?? [] };
}

/** Returns the feature with the scenario's status set, appending the scenario if needed; the input is not modified. */
export function recordScenario(feature: FeatureProgress, name: string, bdd: string): FeatureProgress {
  if (!SCENARIO_STATUSES.includes(bdd)) {
    throw new ProgressError(`invalid scenario status "${bdd}": use pass, fail or pending`);
  }
  if (feature.status === FEATURE_STATUS.pending) {
    throw new ProgressError(`${feature.id} has not started and cannot hold scenarios`);
  }
  const existing = feature.scenarios ?? [];
  const scenarios = existing.some((s) => s.name === name)
    ? existing.map((s) => (s.name === name ? { name, bdd } : s))
    : [...existing, { name, bdd }];
  return { ...feature, scenarios };
}

/** Returns the feature marked done, without a cycle step; the input is not modified. */
export function completeFeature(feature: FeatureProgress): FeatureProgress {
  if (!feature.scenarios?.length) {
    throw new ProgressError(`${feature.id} has no scenarios and cannot be marked done`);
  }
  const failing = feature.scenarios.filter((s) => s.bdd !== PASSING).map((s) => `"${s.name}"`);
  if (failing.length > 0) {
    throw new ProgressError(`${feature.id} cannot be marked done: scenarios not passing: ${failing.join(", ")}`);
  }
  const { cycle_step: _step, ...rest } = feature;
  return { ...rest, status: FEATURE_STATUS.done };
}

const TOP_LEVEL_FIELDS = ["current_focus", "features"];
export const CYCLE_STEPS: string[] = Object.values(CYCLE_STEP);
/** The FR id pattern (ADR-026), shared with the SPEC.md parser. */
export const FR_ID_SOURCE = "FR-[A-Z][A-Z0-9]*-\\d{2,3}[a-z]?";
const FEATURE_ID_PATTERN = new RegExp(`^${FR_ID_SOURCE}$`);
const FEATURE_STATUSES: string[] = Object.values(FEATURE_STATUS);
const REQUIRED_FEATURE_FIELDS = ["id", "title", "status"];
export const FEATURE_FIELDS = ["id", "title", "status", "cycle_step", "scenarios"];
export const SCENARIO_FIELDS = ["name", "bdd"];

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function notAnObject(path: string): string {
  return `${path}: wrong type (expected object)`;
}

function unknownFields(object: object, allowed: string[], path: string): string[] {
  return Object.keys(object)
    .filter((field) => !allowed.includes(field))
    .map((field) => `${path}${field}: unknown field`);
}

function validateScenario(scenario: unknown, path: string): string[] {
  if (!isObject(scenario)) return [notAnObject(path)];
  const { name, bdd } = scenario as ScenarioProgress;
  const violations = unknownFields(scenario, SCENARIO_FIELDS, `${path}.`);
  if (typeof name !== "string") {
    violations.push(`${path}.name: wrong type (expected string)`);
  } else if (name === "") {
    violations.push(`${path}.name: must not be empty`);
  }
  if (!SCENARIO_STATUSES.includes(bdd)) {
    violations.push(`${path}.bdd: invalid value "${bdd}" (allowed: ${SCENARIO_STATUSES.join(", ")})`);
  }
  return violations;
}

function missingFields(feature: FeatureProgress, path: string): string[] {
  return REQUIRED_FEATURE_FIELDS.filter((field) => !(field in feature)).map((field) => `${path}.${field}: missing required field`);
}

/** The rule that only a started feature has a cycle step, and a feature in progress must have one. */
function validateCycleStepPresence(feature: FeatureProgress, path: string): string[] {
  if ((feature.status === FEATURE_STATUS.pending || feature.status === FEATURE_STATUS.done) && "cycle_step" in feature) {
    return [`${path}.cycle_step: not allowed on a ${feature.status} feature`];
  }
  if (feature.status === FEATURE_STATUS.inProgress && !("cycle_step" in feature)) {
    return [`${path}.cycle_step: missing required field on an in-progress feature`];
  }
  return [];
}

function validateTitle(feature: FeatureProgress, path: string): string[] {
  if ("title" in feature && typeof feature.title !== "string") return [`${path}.title: wrong type (expected string)`];
  return feature.title === "" ? [`${path}.title: must not be empty`] : [];
}

function validateScenarios(feature: FeatureProgress, path: string): string[] {
  if (feature.scenarios !== undefined && !Array.isArray(feature.scenarios)) {
    return [`${path}.scenarios: wrong type (expected array)`];
  }
  return (feature.scenarios ?? []).flatMap((scenario: unknown, index) => validateScenario(scenario, `${path}.scenarios[${index}]`));
}

function validateFeature(feature: FeatureProgress, path: string): string[] {
  const violations = [...unknownFields(feature, FEATURE_FIELDS, `${path}.`), ...missingFields(feature, path), ...validateCycleStepPresence(feature, path)];
  if ("id" in feature && !FEATURE_ID_PATTERN.test(feature.id)) {
    violations.push(`${path}.id: invalid value "${feature.id}" (expected an id like FR-AREA-01)`);
  }
  if (feature.cycle_step !== undefined && !CYCLE_STEPS.includes(feature.cycle_step)) {
    violations.push(`${path}.cycle_step: invalid value "${feature.cycle_step}" (allowed: ${CYCLE_STEPS.join(", ")})`);
  }
  violations.push(...validateTitle(feature, path));
  if ("status" in feature && !FEATURE_STATUSES.includes(feature.status)) {
    violations.push(`${path}.status: invalid value "${feature.status}" (allowed: ${FEATURE_STATUSES.join(", ")})`);
  }
  violations.push(...validateScenarios(feature, path));
  return violations;
}

/** Returns one message per schema violation; an empty list means the document is valid. */
export function validateProgress(document: unknown): string[] {
  if (!isObject(document)) return [notAnObject("$")];
  const progress = document as unknown as Progress;
  const violations = unknownFields(progress, TOP_LEVEL_FIELDS, "");
  if (typeof progress.current_focus !== "string" && progress.current_focus !== null) {
    violations.push("current_focus: wrong type (expected string or null)");
  }
  if (!Array.isArray(progress.features)) {
    violations.push("features: wrong type (expected array)");
    return violations;
  }
  progress.features.forEach((feature: unknown, index) => {
    const path = `features[${index}]`;
    violations.push(...(isObject(feature) ? validateFeature(feature as FeatureProgress, path) : [notAnObject(path)]));
  });
  return violations;
}
