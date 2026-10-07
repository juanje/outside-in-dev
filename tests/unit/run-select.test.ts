import { describe, expect, it } from "vitest";
import type { Progress } from "../../src/artifacts/progress.js";
import { selectTargets } from "../../src/orchestrator/select.js";

const progress: Progress = {
  current_focus: null,
  features: [
    { id: "FR-A-01", title: "One", status: "done" },
    { id: "FR-A-02", title: "Two", status: "pending" },
    { id: "FR-A-03", title: "Three", status: "in_progress", cycle_step: "bdd_red" },
    { id: "FR-A-04", title: "Four", status: "pending" },
  ],
};
const specIds = ["FR-A-01", "FR-A-02", "FR-A-03", "FR-A-04", "FR-A-05"];

describe("selecting the features of a run", () => {
  it("takes the pending features in the order of the progress file when none is given", () => {
    expect(selectTargets({ fr: [] }, specIds, progress)).toEqual(["FR-A-02", "FR-A-04"]);
  });

  it("stops at the number of features it is limited to", () => {
    expect(selectTargets({ fr: [], maxFrs: 1 }, specIds, progress)).toEqual(["FR-A-02"]);
  });

  it("takes the features it is given, in the order given", () => {
    expect(selectTargets({ fr: ["FR-A-04", "FR-A-02"] }, specIds, progress)).toEqual(["FR-A-04", "FR-A-02"]);
  });

  it("refuses a feature that SPEC.md does not define", () => {
    expect(() => selectTargets({ fr: ["FR-A-02", "FR-A-09"] }, specIds, progress)).toThrow("FR-A-09 is not in SPEC.md");
  });

  it("refuses a feature that the progress file does not track", () => {
    expect(() => selectTargets({ fr: ["FR-A-05"] }, specIds, progress)).toThrow("FR-A-05 is not tracked in progress.json");
  });

  it("refuses a feature that is done or in progress", () => {
    expect(() => selectTargets({ fr: ["FR-A-01"] }, specIds, progress)).toThrow("FR-A-01 is not pending");
    expect(() => selectTargets({ fr: ["FR-A-03"] }, specIds, progress)).toThrow("FR-A-03 is not pending");
  });
});
