import { describe, expect, it } from "vitest";
import { unrecordedScenarios } from "../../src/artifacts/consistency.js";
import type { FeatureProgress } from "../../src/artifacts/progress.js";

const feature: FeatureProgress = {
  id: "FR-X-01",
  title: "Login",
  status: "in_progress",
  cycle_step: "quality_gate",
  scenarios: [{ name: "Recorded login", bdd: "pass" }],
};

describe("unrecordedScenarios", () => {
  it("names the scenarios tagged with the feature that it does not record, in file order", () => {
    const scenarios = [
      { name: "Recorded login", tags: ["@FR-X-01"] },
      { name: "Second login", tags: ["@FR-X-01"] },
      { name: "Other feature login", tags: ["@FR-X-02"] },
      { name: "First login", tags: ["@FR-X-02", "@FR-X-01"] },
    ];
    expect(unrecordedScenarios(feature, scenarios)).toEqual(["Second login", "First login"]);
  });

  it("names a feature with no recorded scenarios by every tagged scenario", () => {
    const { scenarios: _recorded, ...bare } = feature;
    expect(unrecordedScenarios(bare, [{ name: "Only login", tags: ["@FR-X-01"] }])).toEqual(["Only login"]);
  });
});
