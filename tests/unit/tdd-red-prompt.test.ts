import { describe, expect, it } from "vitest";
import { tddRedPrompt } from "../../src/agents/prompts/tdd-red.js";
import { expectNoSharedTrait } from "./fix-at-cause-sentences.js";
import { expectAccessRule, profileOf } from "./prompt-profile.js";

describe("the instructions of the agent that writes one unit test", () => {
  it("say who it is and what oid is, start from the failure of the scenario, give the reason for one test at a time, name the test to try and the report fields, and end with the report", () => {
    const instructions = tddRedPrompt("FR-A-02", profileOf("TDD_RED"));
    expect(instructions).toMatch(/^You are a specialist in Test-Driven Development: you write the next small unit test that drives the code forward\./);
    expect(instructions).toMatch(/A program called oid orchestrates it/);
    expect(instructions).toMatch(/The scenario below fails, with the failure shown/);
    expect(instructions).toMatch(/1\. /);
    expect(instructions).toMatch(/One test at a time keeps each step small/);
    expect(instructions).toMatch(/change only unit test files/i);
    expect(instructions).toContain('call the `try` tool with target "<test file> > <describe> > <name>"');
    expect(instructions).toMatch(/<file> > <describe> > <name>/);
    expect(instructions).toMatch(/no_unit_logic_left/);
    expect(instructions).toContain("FR-A-02");
    expect(instructions).not.toMatch(/outside-in|vitest|cucumber|tsc/i);
    expect(instructions.trimEnd().split("\n").at(-1)).toMatch(/call the report tool/i);
  });

  it("tell the writer to assert that what the code must produce exists before checking its content, and why", () => {
    const instructions = tddRedPrompt("FR-A-02", profileOf("TDD_RED"));
    expect(instructions).toContain("When the test reads something the code must produce (a file, a record, a message, a call), first assert that it exists, then check its content. A missing behaviour then fails as an assertion, which oid accepts as a valid Red by itself; an error such as a missing file has to be put to the person, and the run waits for their answer.");
  });

  it("do not hold the fix-at-cause trait of the agents that change code", () => {
    expectNoSharedTrait(tddRedPrompt("FR-A-02", profileOf("TDD_RED")));
  });

  it("state in rule 4 the globs its profile lets it write and read, the conventions files included, with the reason for the writing limit", () => {
    expectAccessRule("TDD_RED", (profile) => tddRedPrompt("FR-A-02", profile), ["Change only unit test files", "the code under test is the next agent's job"]);
  });
});
