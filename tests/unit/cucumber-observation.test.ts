import { describe, expect, it } from "vitest";
import { observeScenario } from "../../src/artifacts/cucumber-report.js";

const TARGET = { file: "features/a.feature", line: 3 };
const passed = { status: "PASSED", message: "" };

describe("observeScenario", () => {
  it("sees a scenario whose every step passed as a test that passes", () => {
    expect(observeScenario([passed, passed], TARGET)).toEqual({ kind: "passed" });
  });

  it("sees the first failed step as the failure of the test, with its message", () => {
    const steps = [passed, { status: "FAILED", message: "AssertionError: 1 !== 2" }, { status: "FAILED", message: "later" }, { status: "SKIPPED", message: "" }];
    expect(observeScenario(steps, TARGET)).toEqual({ kind: "error", message: "AssertionError: 1 !== 2" });
  });

  it.each(["UNDEFINED", "PENDING", "AMBIGUOUS"])("sees a %s step as a test that did not run, even after a step that failed", (status) => {
    const steps = [{ status: "FAILED", message: "AssertionError: 1 !== 2" }, { status, message: "" }];
    expect(observeScenario(steps, TARGET)).toEqual({ kind: "not_run", status });
  });

  it("sees a report without steps as a line where no scenario starts", () => {
    expect(observeScenario([], TARGET)).toEqual({ kind: "no_scenario", file: "features/a.feature", line: 3 });
  });
});
