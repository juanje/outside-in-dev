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

  it("leaves out an attachment that is not text", () => {
    const report = gherkinReport([{ keyword: "When ", text: "it is shouted at Ann", status: "FAILED", message: "boom", attached: ["iVBORw0KGgo="], mediaType: "image/png" }]);
    expect(failedStep(report)).toEqual({ step: `${URI}:4 When it is shouted at Ann`, output: "" });
  });
});
