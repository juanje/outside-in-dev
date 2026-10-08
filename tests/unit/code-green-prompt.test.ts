import { describe, expect, it } from "vitest";
import { codeGreenPrompt } from "../../src/agents/prompts/code-green.js";

describe("the instructions of the agent that writes the minimum code", () => {
  it("are procedural, name the requirement, tell it to reuse the catalogue and to run the checks, forbid git and tests changes and end with the report", () => {
    const instructions = codeGreenPrompt("FR-A-02");
    expect(instructions).toMatch(/^You write the minimum code that makes the failing test pass, for the current scenario of FR-A-02/);
    expect(instructions).toMatch(/1\. /);
    expect(instructions).toMatch(/reuse catalogue/i);
    expect(instructions).toMatch(/do not change tests/i);
    expect(instructions).toMatch(/do not run git/i);
    expect(instructions.trimEnd().split("\n").at(-1)).toMatch(/call the report tool/i);
  });
});
