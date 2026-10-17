import { describe, expect, it } from "vitest";

describe("redNext", () => {
  it("asks for the steps to be defined when a scenario did not run because steps have no definition", async () => {
    const { redNext } = await import("../../src/artifacts/red-next.js");
    expect(redNext({ class: "test_bug", passed: false, undefinedSteps: true, then: "check it with the try tool" })).toBe("define the steps listed in a step file, with the text the scenario words them with, then check it with the try tool");
  });

  it("says what to do about a test that is not a valid Red, by the class of what the run showed", async () => {
    const { redNext } = await import("../../src/artifacts/red-next.js");
    const then = "check it with the try tool";
    expect(redNext({ class: "test_bug", passed: true, then })).toBe("test a behaviour the code does not have yet, then check it with the try tool");
    expect(redNext({ class: "test_bug", passed: false, then })).toBe("fix the test so that it fails because the behaviour is missing, not because the test is broken, then check it with the try tool");
    expect(redNext({ class: "environment", passed: false, then })).toBe("fix what stops the runner from running the test, then check it with the try tool");
  });
});
