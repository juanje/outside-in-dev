import { describe, expect, it } from "vitest";
import { listLocatedScenarios } from "../../src/artifacts/traceability.js";

const FEATURE = ["@FR-A-01", "Feature: A", "", "  Rule: R", "", "    Scenario: Nested", "      Given x", "", "  Scenario: Plain", "    Given y", ""].join("\n");

describe("listLocatedScenarios", () => {
  it("gives the line where each scenario starts, also inside a rule", () => {
    const listed = listLocatedScenarios([{ path: "features/a.feature", text: FEATURE }]);
    expect(listed.map(({ name, line }) => ({ name, line }))).toEqual([
      { name: "Nested", line: 6 },
      { name: "Plain", line: 9 },
    ]);
  });
});
