import { describe, expect, it } from "vitest";
import { qualityFixPrompt } from "../../src/agents/prompts/quality-fix.js";

describe("the instructions of the agent that fixes the errors of the quality gate", () => {
  it("say who it is and what oid is, name the requirement and the files it owns, give the reason to change nothing else, name the check and end with the report", () => {
    const instructions = qualityFixPrompt("FR-A-02", "unit tests");
    expect(instructions).toMatch(/^You are a specialist in code quality: you fix the lint and type errors listed below without changing what the code does\./);
    expect(instructions).toMatch(/A program called oid orchestrates it/);
    expect(instructions).toContain("in the unit tests you own, for FR-A-02");
    expect(instructions).toMatch(/1\. /);
    expect(instructions).toMatch(/change only the files you own/i);
    expect(instructions).toMatch(/call the `try` tool with the target of a test that covers the code you changed/);
    expect(instructions).not.toMatch(/outside-in|vitest|cucumber|tsc/i);
    expect(instructions.trimEnd().split("\n").at(-1)).toMatch(/call the report tool/i);
  });
});
