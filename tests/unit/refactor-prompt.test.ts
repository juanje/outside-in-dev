import { describe, expect, it } from "vitest";
import { refactorPrompt } from "../../src/agents/prompts/refactor.js";

describe("the instructions of the agent that fixes the findings of a Green", () => {
  it("are procedural, limit the work to the listed findings in source files, forbid git and end with the report", () => {
    const instructions = refactorPrompt("FR-A-02");
    expect(instructions).toMatch(/^You fix exactly the findings listed below, in the code just written for FR-A-02/);
    expect(instructions).toMatch(/1\. /);
    expect(instructions).toMatch(/reuse catalogue/i);
    expect(instructions).toMatch(/nothing else/i);
    expect(instructions).toMatch(/do not change tests/i);
    expect(instructions).toMatch(/do not run git/i);
    expect(instructions.trimEnd().split("\n").at(-1)).toMatch(/call the report tool/i);
  });
});
