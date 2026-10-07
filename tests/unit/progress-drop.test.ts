import { describe, expect, it } from "vitest";
import { dropScenario } from "../../src/artifacts/progress.js";

const STARTED = {
  id: "FR-X-01",
  title: "Alpha",
  status: "in_progress",
  cycle_step: "bdd_red",
  scenarios: [
    { name: "S1", bdd: "pending" },
    { name: "S2", bdd: "fail" },
  ],
};

describe("dropScenario", () => {
  it("removes a pending scenario and keeps the others", () => {
    expect(dropScenario(STARTED, "S1").scenarios).toEqual([{ name: "S2", bdd: "fail" }]);
  });

  it("refuses a scenario that is not pending, naming it and its status, and one the feature does not have", () => {
    const passed = { ...STARTED, scenarios: [{ name: "S3", bdd: "pass" }] };
    expect([() => dropScenario(STARTED, "S2"), () => dropScenario(passed, "S3"), () => dropScenario(STARTED, "S9")].map((drop) => {
      try {
        drop();
        return "dropped";
      } catch (error) {
        return (error as Error).message;
      }
    })).toEqual([
      'FR-X-01 "S2" is fail: only a pending scenario can be dropped',
      'FR-X-01 "S3" is pass: only a pending scenario can be dropped',
      'FR-X-01 has no scenario "S9"',
    ]);
  });
});
