import { CYCLE_STEPS, FEATURE_FIELDS, PROGRESS_FILE, ProgressError, SCENARIO_FIELDS, type FeatureProgress, type Progress } from "./progress.js";

export interface Conversion {
  progress: Progress;
  /** One line per item that was converted or could not be carried over. */
  notes: string[];
}

const PENDING_EQUIVALENTS = ["blocked", "deferred"];
const UNIT_TESTS_FIELD = "unit_tests";
const DEFAULT_STEP = "select";
const CONVERTED_STEPS: Record<string, string> = { spec_review: "select", implementing: "tdd_red", bdd_green: "quality_gate" };

/** A field value as shown in a note: strings as written, anything else as JSON. */
function show(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** Reduces the scenarios of a feature to name and bdd, listing the extra fields; returns how many had unit_tests. */
function convertScenarios(feature: any, notes: string[]): number {
  let withUnitTests = 0;
  if (feature.scenarios) {
    feature.scenarios = feature.scenarios.map((scenario: any) => {
      const { name, bdd } = scenario;
      if (UNIT_TESTS_FIELD in scenario) withUnitTests++;
      for (const [field, value] of Object.entries(scenario)) {
        if (!SCENARIO_FIELDS.includes(field) && field !== UNIT_TESTS_FIELD) {
          notes.push(`${feature.id}, scenario ${name}: ${field} ${show(value)} dropped`);
        }
      }
      return { name, bdd };
    });
  }
  return withUnitTests;
}

/** Converts a progress document written for another schema to the current one; the input is not modified. */
export function convertProgress(document: any): Conversion {
  if (!Array.isArray(document?.features)) {
    throw new ProgressError(`${PROGRESS_FILE} cannot be imported: features must be a list`);
  }
  const notes: string[] = [];
  let unitTestScenarios = 0;
  const features = document.features.map((old: any): FeatureProgress => {
    const feature = { ...old };
    if (PENDING_EQUIVALENTS.includes(old.status)) {
      feature.status = "pending";
      notes.push(`${old.id}: status ${old.status} converted to pending`);
    }
    if (old.status === "in_progress" && !CYCLE_STEPS.includes(old.cycle_step)) {
      const converted = CONVERTED_STEPS[old.cycle_step] ?? DEFAULT_STEP;
      feature.cycle_step = converted;
      notes.push(`${old.id}: cycle_step ${old.cycle_step} converted to ${converted}`);
    }
    if (feature.status === "pending") {
      delete feature.scenarios;
      if (old.scenarios?.length > 0) notes.push(`${old.id}: ${old.scenarios.length} scenarios dropped`);
    }
    if (feature.status === "pending" || feature.status === "done") {
      delete feature.cycle_step;
      if (old.cycle_step !== undefined && !(feature.status === "done" && old.cycle_step === "done")) {
        notes.push(`${old.id}: cycle_step ${old.cycle_step} dropped`);
      }
    }
    for (const [field, value] of Object.entries(old)) {
      if (!FEATURE_FIELDS.includes(field)) {
        delete feature[field];
        notes.push(`${old.id}: ${field} ${show(value)} dropped`);
      }
    }
    unitTestScenarios += convertScenarios(feature, notes);
    return feature;
  });
  if (unitTestScenarios > 0) notes.push(`unit_tests dropped from ${unitTestScenarios} scenarios`);
  let focus = document.current_focus;
  if (focus !== null && features.find((f: FeatureProgress) => f.id === focus)?.status !== "in_progress") {
    notes.push(`current_focus ${focus} reset to null`);
    focus = null;
  }
  return { progress: { current_focus: focus, features }, notes };
}
