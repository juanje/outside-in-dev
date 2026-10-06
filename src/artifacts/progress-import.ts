import { CYCLE_STEP, CYCLE_STEPS, FEATURE_FIELDS, FEATURE_STATUS, PROGRESS_FILE, ProgressError, SCENARIO_FIELDS, type Progress } from "./progress.js";

export interface Conversion {
  progress: Progress;
  /** One line per item that was converted or could not be carried over. */
  notes: string[];
}

const PENDING_EQUIVALENTS = ["blocked", "deferred"];
const UNIT_TESTS_FIELD = "unit_tests";
const DEFAULT_STEP = CYCLE_STEP.select;
/** A `cycle_step` the old schema used for a finished feature. */
const LEGACY_DONE_STEP = "done";
const CONVERTED_STEPS: Record<string, string> = { spec_review: CYCLE_STEP.select, implementing: CYCLE_STEP.tddRed, bdd_green: CYCLE_STEP.qualityGate };

/** An object of the old schema: any field may be there, none is trusted. */
type OldObject = Record<string, unknown>;

/** The value as an object of the old schema; anything that is not an object has no fields. */
function asObject(value: unknown): OldObject {
  return typeof value === "object" && value !== null ? (value as OldObject) : {};
}

function isOneOf(allowed: string[], value: unknown): boolean {
  return typeof value === "string" && allowed.includes(value);
}

/** A field value as shown in a note: strings as written, anything else as JSON. */
function show(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** A count with its noun, in the singular for one: "1 scenario", "2 scenarios". */
function scenarioCount(count: number): string {
  return `${count} ${count === 1 ? "scenario" : "scenarios"}`;
}

/** Reduces the scenarios of a feature to name and bdd, listing the extra fields; returns how many had unit_tests. */
function convertScenarios(feature: OldObject, notes: string[]): number {
  let withUnitTests = 0;
  if (Array.isArray(feature.scenarios)) {
    const scenarios: unknown[] = feature.scenarios;
    feature.scenarios = scenarios.map((item) => {
      const scenario = asObject(item);
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

function convertStatus(feature: OldObject, old: OldObject, notes: string[]): void {
  if (!isOneOf(PENDING_EQUIVALENTS, old.status)) return;
  feature.status = FEATURE_STATUS.pending;
  notes.push(`${old.id}: status ${old.status} converted to pending`);
}

function convertCycleStep(feature: OldObject, old: OldObject, notes: string[]): void {
  if (old.status !== FEATURE_STATUS.inProgress || isOneOf(CYCLE_STEPS, old.cycle_step)) return;
  const converted = (typeof old.cycle_step === "string" ? CONVERTED_STEPS[old.cycle_step] : undefined) ?? DEFAULT_STEP;
  feature.cycle_step = converted;
  notes.push(`${old.id}: cycle_step ${old.cycle_step} converted to ${converted}`);
}

function dropScenariosOfPending(feature: OldObject, old: OldObject, notes: string[]): void {
  if (feature.status !== FEATURE_STATUS.pending) return;
  delete feature.scenarios;
  if (Array.isArray(old.scenarios) && old.scenarios.length > 0) {
    notes.push(`${old.id}: ${scenarioCount(old.scenarios.length)} dropped`);
  }
}

function dropCycleStepOfUnstarted(feature: OldObject, old: OldObject, notes: string[]): void {
  if (feature.status !== FEATURE_STATUS.pending && feature.status !== FEATURE_STATUS.done) return;
  delete feature.cycle_step;
  if (old.cycle_step !== undefined && !(feature.status === FEATURE_STATUS.done && old.cycle_step === LEGACY_DONE_STEP)) {
    notes.push(`${old.id}: cycle_step ${old.cycle_step} dropped`);
  }
}

function dropUnknownFields(feature: OldObject, old: OldObject, notes: string[]): void {
  for (const [field, value] of Object.entries(old)) {
    if (!FEATURE_FIELDS.includes(field)) {
      delete feature[field];
      notes.push(`${old.id}: ${field} ${show(value)} dropped`);
    }
  }
}

/** Converts a copy of one old feature; returns it with the number of unit-test scenarios dropped. */
function convertFeature(item: unknown, notes: string[]): { feature: OldObject; unitTestScenarios: number } {
  const old = asObject(item);
  const feature = { ...old };
  convertStatus(feature, old, notes);
  convertCycleStep(feature, old, notes);
  dropScenariosOfPending(feature, old, notes);
  dropCycleStepOfUnstarted(feature, old, notes);
  dropUnknownFields(feature, old, notes);
  return { feature, unitTestScenarios: convertScenarios(feature, notes) };
}

/** Converts a progress document written for another schema to the current one; the input is not modified. */
export function convertProgress(document: unknown): Conversion {
  const { features: oldFeatures, current_focus } = asObject(document);
  if (!Array.isArray(oldFeatures)) {
    throw new ProgressError(`${PROGRESS_FILE} cannot be imported: features must be a list`);
  }
  const notes: string[] = [];
  let unitTestScenarios = 0;
  const features = oldFeatures.map((item: unknown): OldObject => {
    const converted = convertFeature(item, notes);
    unitTestScenarios += converted.unitTestScenarios;
    return converted.feature;
  });
  if (unitTestScenarios > 0) notes.push(`unit_tests dropped from ${scenarioCount(unitTestScenarios)}`);
  let focus = current_focus;
  if (focus !== null && features.find((f) => f.id === focus)?.status !== FEATURE_STATUS.inProgress) {
    notes.push(`current_focus ${focus} reset to null`);
    focus = null;
  }
  // The result of the conversion is not trusted either: the caller validates it against the schema before it is written.
  return { progress: { current_focus: focus, features } as unknown as Progress, notes };
}
