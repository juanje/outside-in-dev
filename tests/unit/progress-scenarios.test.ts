import { describe, expect, it } from "vitest";
import { recordScenario } from "../../src/artifacts/progress.js";

const STARTED = {
  id: "FR-X-01",
  title: "Alpha",
  status: "in_progress",
  cycle_step: "bdd_red",
  scenarios: [{ name: "S1", bdd: "fail" }],
};

describe("recordScenario", () => {
  it("updates the status of an existing scenario", () => {
    expect(recordScenario(STARTED, "S1", "pass").scenarios).toEqual([{ name: "S1", bdd: "pass" }]);
  });

  it("appends a scenario that does not exist yet", () => {
    expect(recordScenario(STARTED, "S2", "fail").scenarios).toEqual([
      { name: "S1", bdd: "fail" },
      { name: "S2", bdd: "fail" },
    ]);
  });

  it("rejects an unknown status word", () => {
    expect(() => recordScenario(STARTED, "S1", "green")).toThrow(/green/);
  });

  it("rejects a feature that has not started", () => {
    const pending = { id: "FR-X-09", title: "Nine", status: "pending" };
    expect(() => recordScenario(pending, "S1", "fail")).toThrow(/FR-X-09/);
  });
});
