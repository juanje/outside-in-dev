import { describe, expect, it } from "vitest";
import { tddRedPrompt } from "../../src/agents/prompts/tdd-red.js";

describe("the instructions of the agent that writes one unit test", () => {
  it("say who it is and what oid is, start from the failure of the scenario, give the reason for one test at a time, name the test to try and the report fields, and end with the report", () => {
    const instructions = tddRedPrompt("FR-A-02");
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
});
