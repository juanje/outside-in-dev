import { describe, expect, it } from "vitest";
import { type FeatureProgress, recordGuard, validateProgress } from "../../src/artifacts/progress.js";

const withScenario = (scenario: object) => ({ current_focus: null, features: [{ id: "FR-X-01", title: "A", status: "in_progress", cycle_step: "bdd_red", scenarios: [scenario] }] });

const feature: FeatureProgress = { id: "FR-X-01", title: "A", status: "in_progress", cycle_step: "bdd_red", scenarios: [{ name: "Nothing is invoked", bdd: "pending" }, { name: "Other", bdd: "fail" }] };

describe("validateProgress guard", () => {
  it("accepts a guard with a reason on a passing scenario, and names an empty reason, a missing one and a guard on a scenario that does not pass", () => {
    expect([
      validateProgress(withScenario({ name: "S", bdd: "pass", guard: { reason: "nothing is invoked" } })),
      validateProgress(withScenario({ name: "S", bdd: "pass", guard: { reason: "" } })),
      validateProgress(withScenario({ name: "S", bdd: "pass", guard: {} })),
      validateProgress(withScenario({ name: "S", bdd: "fail", guard: { reason: "x" } })),
    ]).toEqual([
      [],
      ["features[0].scenarios[0].guard.reason: must not be empty"],
      ["features[0].scenarios[0].guard.reason: wrong type (expected string)"],
      ["features[0].scenarios[0].guard: only a passing scenario can be a guard"],
    ]);
  });
});

describe("recordGuard", () => {
  it("records the scenario as passing with the reason of the person who accepted it, and leaves the others as they are", () => {
    expect(recordGuard(feature, "Nothing is invoked", "no command is configured").scenarios).toEqual([
      { name: "Nothing is invoked", bdd: "pass", guard: { reason: "no command is configured" } },
      { name: "Other", bdd: "fail" },
    ]);
  });
});
