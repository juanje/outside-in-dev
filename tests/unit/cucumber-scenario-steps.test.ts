import { describe, expect, it } from "vitest";
import { normalizeCucumberReport } from "../../src/artifacts/cucumber-report.js";
import { runMessages } from "./cucumber-run-messages.js";

describe("normalizeCucumberReport of one scenario among several", () => {
  it("lists only the steps of the scenario with that file and name", () => {
    const report = runMessages([
      { uri: "features/a.feature", name: "Passing", steps: [{ text: "x", status: "PASSED" }] },
      { uri: "features/b.feature", name: "Current", steps: [{ text: "y", status: "PASSED" }, { text: "z", status: "FAILED", message: "boom" }] },
    ]);
    expect(normalizeCucumberReport(report, { file: "features/b.feature", name: "Current" })).toEqual([
      { status: "PASSED", message: "" },
      { status: "FAILED", message: "boom" },
    ]);
  });
});
