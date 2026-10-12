import { describe, expect, it } from "vitest";
import { bddRedPrompt } from "../../src/agents/prompts/bdd-red.js";
import { expectNoSharedTrait } from "./fix-at-cause-sentences.js";
import { expectAccessRule, profileOf } from "./prompt-profile.js";

describe("the instructions of the agent that writes step definitions", () => {
  it("say who it is and what oid is, give the scenario to try and the reasons for each rule, and end with the report", () => {
    const instructions = bddRedPrompt("FR-A-02", "features/a.feature:12", profileOf("BDD_RED"));
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

  it("ask for imports of only what the feature needs, and tell the writer to report a scenario that already passes instead of making it fail", () => {
    const instructions = bddRedPrompt("FR-A-02", "features/a.feature:12", profileOf("BDD_RED"));
    expect(instructions).toContain("Import only code the feature itself needs: a function that exists only so your step can observe something is not part of the feature, and the next agents would have to invent it.");
    expect(instructions).toContain("6. If the scenario passes as soon as its steps exist, because what it describes already holds without new code (for example, nothing happens when nothing is configured), that is a correct result, not a mistake to fix. Do not make it fail: a step that needs code which does not exist, or a check written so that it fails, sends the next agents to write code that serves only your step. Call the report tool as done; oid then asks the person whether to keep the scenario as a guard against regressions.");
    expect(instructions).toContain("7. Call the report tool once, listing every file you changed.");
  });

  it("do not hold the fix-at-cause trait of the agents that change code", () => {
    expectNoSharedTrait(bddRedPrompt("FR-A-02", "features/a.feature:12", profileOf("BDD_RED")));
  });

  it("state in rule 4 the globs its profile lets it write and read, the conventions files included, with the reason for the writing limit", () => {
    const limit = "Change only step definition files";
    const reason = "the code the steps call does not exist yet, and writing it is the next agent's job";
    expectAccessRule("BDD_RED", (profile) => bddRedPrompt("FR-A-02", "features/a.feature:12", profile), [limit, reason]);
  });
});
