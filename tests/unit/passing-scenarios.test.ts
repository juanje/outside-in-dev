import { describe, expect, it } from "vitest";
import { locatePassingScenarios } from "../../src/artifacts/passing-scenarios.js";

const located = [
  { file: "features/a.feature", name: "Adds", line: 4, tags: ["@FR-A-01"] },
  { file: "features/b.feature", name: "Adds", line: 7, tags: ["@FR-B-01"] },
  { file: "features/b.feature", name: "Subtracts", line: 11, tags: ["@FR-B-01"] },
];

const progress = {
  current_focus: null,
  features: [
    { id: "FR-A-01", title: "A", status: "done", scenarios: [{ name: "Adds", bdd: "pass" }] },
    {
      id: "FR-B-01",
      title: "B",
      status: "in_progress",
      cycle_step: "tdd_green",
      scenarios: [
        { name: "Adds", bdd: "pass" },
        { name: "Subtracts", bdd: "fail" },
        { name: "Multiplies", bdd: "pass" },
      ],
    },
    { id: "FR-C-01", title: "C", status: "pending" },
  ],
};

describe("locatePassingScenarios", () => {
  it("finds each scenario recorded as passing by its name among the scenarios tagged with its feature, and names those it cannot find", () => {
    expect(locatePassingScenarios(progress, located)).toEqual({
      found: [
        { feature: "FR-A-01", file: "features/a.feature", line: 4, name: "Adds" },
        { feature: "FR-B-01", file: "features/b.feature", line: 7, name: "Adds" },
      ],
      missing: [{ feature: "FR-B-01", name: "Multiplies" }],
    });
  });
});
