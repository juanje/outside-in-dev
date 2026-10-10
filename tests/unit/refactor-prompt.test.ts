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
});
