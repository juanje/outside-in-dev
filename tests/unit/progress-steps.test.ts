import { describe, expect, it } from "vitest";
import { advanceStep } from "../../src/artifacts/progress.js";

describe("advanceStep", () => {
  it("starts a pending feature with select", () => {
    const feature = { id: "FR-X-01", title: "Alpha", status: "pending" };
    expect(advanceStep(feature, "select")).toEqual({
      id: "FR-X-01",
      title: "Alpha",
      status: "in_progress",
      cycle_step: "select",
      scenarios: [],
    });
  });

  it("moves a started feature forward and keeps its scenarios", () => {
    const feature = {
      id: "FR-X-01",
      title: "Alpha",
      status: "in_progress",
      cycle_step: "select",
      scenarios: [{ name: "S1", bdd: "fail" }],
    };
    expect(advanceStep(feature, "bdd_red")).toEqual({ ...feature, cycle_step: "bdd_red" });
  });

  it("rejects skipping a step, naming both steps", () => {
    const feature = { id: "FR-X-01", title: "Alpha", status: "in_progress", cycle_step: "select", scenarios: [] };
    expect(() => advanceStep(feature, "tdd_green")).toThrow(/select.*tdd_green/);
  });

  it.each([
    ["bdd_red", "tdd_red"],
    ["tdd_red", "tdd_green"],
    ["tdd_green", "refactor"],
    ["tdd_green", "tdd_red"],
    ["tdd_green", "bdd_red"],
    ["tdd_green", "quality_gate"],
    ["refactor", "tdd_red"],
    ["refactor", "bdd_red"],
    ["refactor", "quality_gate"],
  ])("allows %s to %s", (from, to) => {
    const feature = { id: "FR-X-01", title: "Alpha", status: "in_progress", cycle_step: from, scenarios: [] };
    expect(advanceStep(feature, to).cycle_step).toBe(to);
  });

  it.each([["bdd_red"], ["tdd_red"]])("lets a gap seen at the quality gate go back to %s", (to) => {
    const feature = { id: "FR-X-01", title: "Alpha", status: "in_progress", cycle_step: "quality_gate", scenarios: [] };
    expect(advanceStep(feature, to).cycle_step).toBe(to);
  });

  it("lets a pending feature start only with select", () => {
    const feature = { id: "FR-X-01", title: "Alpha", status: "pending" };
    expect(() => advanceStep(feature, "bdd_red")).toThrow(/pending.*bdd_red/);
  });
});
