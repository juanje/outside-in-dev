import { describe, expect, it } from "vitest";
import type { FeatureProgress } from "../../src/artifacts/progress.js";
import { moveRunTo } from "../../src/orchestrator/worktree-progress.js";

const feature = (step: string): FeatureProgress => ({ id: "FR-A-01", title: "A", status: "in_progress", cycle_step: step, scenarios: [{ name: "S", bdd: "fail" }] });

describe("a run moving the feature to a step", () => {
  it("leaves the feature as it is when it is already at that step", () => {
    expect(moveRunTo(feature("tdd_green"), "tdd_green")).toEqual(feature("tdd_green"));
  });
});
