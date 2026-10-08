import { describe, expect, it } from "vitest";
import { reopenFeature, type FeatureProgress } from "../../src/artifacts/progress.js";

const DONE: FeatureProgress = { id: "FR-X-01", title: "Alpha", status: "done", scenarios: [{ name: "A", bdd: "pass" }] };

describe("reopenFeature", () => {
  it("puts a done feature back at quality_gate with its scenarios as they were", () => {
    expect(reopenFeature(DONE)).toEqual({ ...DONE, status: "in_progress", cycle_step: "quality_gate" });
  });

  it("refuses a feature that is not done", () => {
    expect(() => reopenFeature({ ...DONE, status: "in_progress", cycle_step: "quality_gate" })).toThrow("FR-X-01 is not done");
  });
});
