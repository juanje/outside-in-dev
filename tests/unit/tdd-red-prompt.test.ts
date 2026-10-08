import { describe, expect, it } from "vitest";
import { tddRedPrompt } from "../../src/agents/prompts/tdd-red.js";

describe("the instructions of the agent that writes one unit test", () => {
  it("are procedural, name the requirement, forbid git, source code and a second test, name the report fields and end with the report", () => {
    const instructions = tddRedPrompt("FR-A-02");
    expect(instructions).toMatch(/^You write one failing unit test for the current scenario of FR-A-02/);
    expect(instructions).toMatch(/1\. /);
    expect(instructions).toMatch(/only one unit test/i);
    expect(instructions).toMatch(/do not change source code/i);
    expect(instructions).toMatch(/do not run git or tests/i);
    expect(instructions).toMatch(/<file> > <describe> > <name>/);
    expect(instructions).toMatch(/no_unit_logic_left/);
    expect(instructions.trimEnd().split("\n").at(-1)).toMatch(/call the report tool/i);
  });
});
