import { describe, expect, it } from "vitest";
import { reviseFeature, type FeatureProgress } from "../../src/artifacts/progress.js";

const DONE: FeatureProgress = { id: "FR-X-01", title: "Alpha", status: "done", scenarios: [{ name: "A", bdd: "pass" }, { name: "B", bdd: "fail" }] };

describe("reviseFeature", () => {
  it("puts a done feature back at bdd_red with every scenario pending", () => {
    expect(reviseFeature(DONE)).toEqual({ ...DONE, status: "in_progress", cycle_step: "bdd_red", scenarios: [{ name: "A", bdd: "pending" }, { name: "B", bdd: "pending" }] });
  });

  it("puts a feature at a later step back at bdd_red", () => {
    const steps = ["tdd_green", "quality_gate"].map((cycle_step) => reviseFeature({ ...DONE, status: "in_progress", cycle_step }).cycle_step);
    expect(steps).toEqual(["bdd_red", "bdd_red"]);
  });

  it("returns a feature already at bdd_red as it is", () => {
    const atRed = { ...DONE, status: "in_progress", cycle_step: "bdd_red" };
    expect(reviseFeature(atRed)).toBe(atRed);
  });
});
