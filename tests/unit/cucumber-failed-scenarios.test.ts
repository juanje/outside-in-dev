import { describe, expect, it } from "vitest";
import { failedScenarios } from "../../src/artifacts/cucumber-report.js";
import { runMessages } from "./cucumber-run-messages.js";

describe("failed scenarios of a Cucumber report", () => {
  it("names each scenario that did not pass, with its file and the step that failed, and none that passed", () => {
    const report = runMessages([
      { uri: "features/cart.feature", name: "Add to cart", steps: [{ text: "a cart", status: "PASSED" }] },
      { uri: "features/pay.feature", name: "Pay with a card", steps: [{ text: "a card", status: "PASSED" }, { text: "I pay", status: "FAILED", message: "boom" }] },
    ]);
    expect(failedScenarios(report)).toEqual(["bdd features/pay.feature: Pay with a card: I pay (boom)"]);
  });
});
