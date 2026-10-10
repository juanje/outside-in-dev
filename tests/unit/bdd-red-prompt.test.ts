import { describe, expect, it } from "vitest";
import { bddRedPrompt } from "../../src/agents/prompts/bdd-red.js";

describe("the instructions of the agent that writes step definitions", () => {
  it("say who it is and what oid is, give the scenario to try and the reasons for each rule, and end with the report", () => {
    const instructions = bddRedPrompt("FR-A-02", "features/a.feature:12");
    expect(instructions).toMatch(/^You are a specialist in Behaviour-Driven Development and test automation: you write the step definitions that turn a Gherkin scenario into an executable test\./);
    expect(instructions).toMatch(/A program called oid orchestrates it/);
    expect(instructions).toMatch(/call the `try` tool/);
    expect(instructions).toMatch(/Write the step definitions for the scenario of FR-A-02 below, so that it runs and fails because the feature does not exist yet/);
    expect(instructions).toMatch(/1\. /);
    expect(instructions).toMatch(/only when its text matches the step exactly/i);
    expect(instructions).toMatch(/import .* dynamically/i);
    expect(instructions).toMatch(/change only step definition files/i);
    expect(instructions).toContain('call the `try` tool with target "features/a.feature:12" and `dry_run` true');
    expect(instructions).toContain('call the `try` tool with target "features/a.feature:12"');
    expect(instructions).not.toMatch(/outside-in|vitest|cucumber|tsc/i);
    expect(instructions.trimEnd().split("\n").at(-1)).toMatch(/call the report tool/i);
  });
});
