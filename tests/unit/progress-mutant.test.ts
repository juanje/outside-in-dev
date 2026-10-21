import { describe, expect, it } from "vitest";
import { type FeatureProgress, recordMutant, recordScenario, reviseFeature, validateProgress } from "../../src/artifacts/progress.js";

const MUTANT = { diff: "--- a/src/a.ts\n+++ b/src/a.ts\n", text: "Scenario: S\n  Given a thing" };
const withScenario = (scenario: object) => ({ current_focus: null, features: [{ id: "FR-X-01", title: "A", status: "in_progress", cycle_step: "bdd_red", scenarios: [scenario] }] });
const feature: FeatureProgress = { id: "FR-X-01", title: "A", status: "in_progress", cycle_step: "bdd_red", scenarios: [{ name: "Alpha", bdd: "pass" }, { name: "Other", bdd: "fail" }] };

describe("validateProgress mutant", () => {
  it("accepts a mutant with its diff and the scenario text, and names a wrong type, an empty part and an unknown field", () => {
    expect([
      validateProgress(withScenario({ name: "S", bdd: "pass", mutant: MUTANT })),
      validateProgress(withScenario({ name: "S", bdd: "pending", mutant: { ...MUTANT, diff: "" } })),
      validateProgress(withScenario({ name: "S", bdd: "pending", mutant: { diff: "d" } })),
      validateProgress(withScenario({ name: "S", bdd: "pending", mutant: "d" })),
      validateProgress(withScenario({ name: "S", bdd: "pending", mutant: { ...MUTANT, note: "x" } })),
    ]).toEqual([
      [],
      ["features[0].scenarios[0].mutant.diff: must not be empty"],
      ["features[0].scenarios[0].mutant.text: wrong type (expected string)"],
      ["features[0].scenarios[0].mutant: wrong type (expected object)"],
      ["features[0].scenarios[0].mutant.note: unknown field"],
    ]);
  });
});

describe("recordMutant", () => {
  it("records the mutant next to the status of the scenario, and leaves the status and the other scenarios as they are", () => {
    expect(recordMutant(feature, "Alpha", MUTANT).scenarios).toEqual([{ name: "Alpha", bdd: "pass", mutant: MUTANT }, { name: "Other", bdd: "fail" }]);
  });

  it("adds a scenario that is not registered as pending", () => {
    expect(recordMutant(feature, "New", MUTANT).scenarios?.at(-1)).toEqual({ name: "New", bdd: "pending", mutant: MUTANT });
  });
});

describe("a recorded mutant", () => {
  it("stays when the status of the scenario is recorded again, and goes with a revise", () => {
    const proved = recordMutant(feature, "Alpha", MUTANT);
    expect(recordScenario(proved, "Alpha", "fail").scenarios?.[0]).toEqual({ name: "Alpha", bdd: "fail", mutant: MUTANT });
    expect(reviseFeature({ ...proved, cycle_step: "tdd_green" }).scenarios?.[0]).toEqual({ name: "Alpha", bdd: "pending" });
  });
});
