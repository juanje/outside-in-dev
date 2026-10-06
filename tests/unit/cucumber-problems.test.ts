import { describe, expect, it } from "vitest";
import { bddProblems } from "../../src/artifacts/cucumber-report.js";
import { type RunScenario, runMessages } from "./cucumber-run-messages.js";

const passing: RunScenario = { uri: "features/a.feature", name: "Adds", steps: [{ text: "a number", status: "PASSED" }] };
const failing: RunScenario = {
  uri: "features/b.feature",
  name: "Subtracts",
  steps: [
    { text: "two numbers", status: "PASSED" },
    { text: "it subtracts", status: "FAILED", message: "AssertionError: 3 !== 2\n    at x" },
    { text: "it shows", status: "SKIPPED" },
  ],
};
const undefinedStep: RunScenario = { uri: "features/c.feature", name: "Divides", steps: [{ text: "it divides", status: "UNDEFINED" }] };

const LOCATIONS = [
  { file: "features/a.feature", line: 3, name: "Adds" },
  { file: "features/b.feature", line: 7, name: "Subtracts" },
  { file: "features/c.feature", line: 2, name: "Divides" },
  { file: "features/d.feature", line: 5, name: "Multiplies" },
];

describe("bddProblems", () => {
  it("lists each scenario that did not pass with its first step that did not, and each that did not run at all", () => {
    expect(bddProblems(runMessages([passing, failing, undefinedStep]), LOCATIONS)).toEqual([
      "bdd features/b.feature:7 Subtracts: it subtracts (AssertionError: 3 !== 2)",
      "bdd features/c.feature:2 Divides: it divides (UNDEFINED)",
      "bdd features/d.feature:5 Multiplies: the scenario did not run",
    ]);
  });
});
