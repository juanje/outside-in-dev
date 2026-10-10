import { describe, expect, it } from "vitest";
import { failedStep } from "../../src/artifacts/cucumber-report.js";
import { gherkinReport, URI } from "./cucumber-gherkin-messages.js";

describe("failedStep", () => {
  it("names the first step that failed with its location, and gives what that step attached", () => {
    const report = gherkinReport([
      { keyword: "Given ", text: "the greeting", status: "PASSED", attached: ["not about the failure"] },
      { keyword: "When ", text: "it is shouted at Ann", status: "FAILED", message: "AssertionError: 1 !== 3", attached: ["first line\nsecond line", "third line"] },
      { keyword: "Then ", text: "it shouts Ann", status: "SKIPPED" },
    ]);
    expect(failedStep(report)).toEqual({ step: `${URI}:5 When it is shouted at Ann`, output: "first line\nsecond line\nthird line" });
  });

  it("gives what a hook of the same run attached after the failed step, and nothing from the runs of other scenarios", () => {
    const report = gherkinReport([{ keyword: "When ", text: "it is shouted at Ann", status: "FAILED", message: "boom", attached: ["from the step"] }], {
      hookAttached: ["from the hook"],
      otherRunAttached: ["from another scenario"],
    });
    expect(failedStep(report)).toEqual({ step: `${URI}:4 When it is shouted at Ann`, output: "from the step\nfrom the hook" });
  });

  it("says that the step failed while setting the scenario up when it is a Given", () => {
    const report = gherkinReport([
      { keyword: "Given ", text: "the greeting", status: "FAILED", message: "AssertionError: 1 !== 3" },
      { keyword: "When ", text: "it is shouted at Ann", status: "SKIPPED" },
    ]);
    expect(failedStep(report)).toEqual({ step: `${URI}:4 Given the greeting`, output: "", setup: true });
  });

  it("treats an And or a But as the kind of step before it: setting up after a Given, not after a When", () => {
    const failing = (previous: string) => gherkinReport([
      { keyword: previous, text: "the greeting", status: "PASSED" },
      { keyword: "And ", text: "it is polite", status: "PASSED" },
      { keyword: "But ", text: "it is not loud", status: "FAILED", message: "boom" },
    ]);
    expect(failedStep(failing("Given "))).toMatchObject({ setup: true });
    expect(failedStep(failing("When "))).not.toHaveProperty("setup");
  });

  it("says that a step of the Background set the scenario up, whatever its keyword", () => {
    const report = gherkinReport(
      [
        { keyword: "Given ", text: "the greeting", status: "PASSED" },
        { keyword: "When ", text: "it is polite", status: "FAILED", message: "boom" },
        { keyword: "Then ", text: "it shouts Ann", status: "SKIPPED" },
      ],
      { background: 2 },
    );
    expect(failedStep(report)).toEqual({ step: `${URI}:5 When it is polite`, output: "", setup: true });
  });

  it("takes the kind of a step from the report when it has one, whatever the language of the keyword", () => {
    const failing = (kind: string, keyword: string) => gherkinReport([
      { keyword, keywordType: kind, text: "el saludo", status: "PASSED" },
      { keyword: "Y ", keywordType: "Conjunction", text: "es cortes", status: "FAILED", message: "boom" },
    ]);
    expect(failedStep(failing("Context", "Dado "))).toMatchObject({ setup: true });
    expect(failedStep(failing("Action", "Cuando "))).not.toHaveProperty("setup");
  });

  it("leaves out an attachment that is not text", () => {
    const report = gherkinReport([{ keyword: "When ", text: "it is shouted at Ann", status: "FAILED", message: "boom", attached: ["iVBORw0KGgo="], mediaType: "image/png" }]);
    expect(failedStep(report)).toEqual({ step: `${URI}:4 When it is shouted at Ann`, output: "" });
  });
});
