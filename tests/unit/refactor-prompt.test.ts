import { describe, expect, it } from "vitest";
import { refactorPrompt } from "../../src/agents/prompts/refactor.js";

describe("the instructions of the agent that fixes the findings of a Green", () => {
  it("say who it is and what oid is, limit the work to the listed findings in source files with the reason, name the check and end with the report", () => {
    const instructions = refactorPrompt("FR-A-02");
    expect(instructions).toMatch(/^You are a specialist in refactoring: you remove the code-health findings listed below without changing what the code does\./);
    expect(instructions).toMatch(/A program called oid orchestrates it/);
    expect(instructions).toContain("in the code just written for FR-A-02");
    expect(instructions).toMatch(/1\. /);
    expect(instructions).toMatch(/reuse catalogue/i);
    expect(instructions).toMatch(/change nothing else/i);
    expect(instructions).toMatch(/change only source files/i);
    expect(instructions).toMatch(/call the `try` tool with the target of a test that covers the code you changed/);
    expect(instructions).not.toMatch(/outside-in|vitest|cucumber|tsc/i);
    expect(instructions.trimEnd().split("\n").at(-1)).toMatch(/call the report tool/i);
  });

  it("say that a finding is fixed at its cause and not hidden, and what to do when no honest fix exists", () => {
    const instructions = refactorPrompt("FR-A-02");
    expect(instructions).toContain("The findings point at code that is harder to read and change: the goal is clearer code, not a quieter detector.");
    expect(instructions).toContain("a repeated value becomes a named constant where it belongs, or the repetition is removed; a long function is split along its steps");
    expect(instructions).toContain("a constant imported from an unrelated module ties modules together for no reason");
    expect(instructions).toContain("the attempt is rolled back and the work is redone, which costs more than the plain fix");
    expect(instructions).toContain("Code that serves the project's own checks, such as the patterns a checker forbids or the way test reports are read, is not where a finding in other code is fixed: changing it to make a test or a check pass changes the rules, not the code.");
    expect(instructions).toContain("If no honest fix exists, call the report tool with status blocked, reason other and the detail, instead of forcing one.");
  });
});
