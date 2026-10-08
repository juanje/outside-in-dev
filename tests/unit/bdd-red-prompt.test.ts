import { describe, expect, it } from "vitest";
import { bddRedPrompt } from "../../src/agents/prompts/bdd-red.js";

describe("the instructions of the agent that writes step definitions", () => {
  it("are procedural, name the requirement, forbid git and tests and end with the report", () => {
    const instructions = bddRedPrompt("FR-A-02");
    expect(instructions).toMatch(/^You write the step definitions for the first scenario of FR-A-02/);
    expect(instructions).toMatch(/1\. /);
    expect(instructions).toMatch(/import .* dynamically/i);
    expect(instructions).toMatch(/do not run git or tests/i);
    expect(instructions.trimEnd().split("\n").at(-1)).toMatch(/call the report tool/i);
  });
});
