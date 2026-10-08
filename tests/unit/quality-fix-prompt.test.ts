import { describe, expect, it } from "vitest";
import { qualityFixPrompt } from "../../src/agents/prompts/quality-fix.js";

describe("the instructions of the agent that fixes the errors of the quality gate", () => {
  it("name the requirement and the files it owns, are procedural, forbid git and tests changes of others and end with the report", () => {
    const instructions = qualityFixPrompt("FR-A-02", "unit tests");
    expect(instructions).toMatch(/^You fix exactly the lint and type errors listed below, in the unit tests you own, for FR-A-02/);
    expect(instructions).toMatch(/1\. /);
    expect(instructions).toMatch(/do not run git/i);
    expect(instructions).toMatch(/change only the files you own/i);
    expect(instructions.trimEnd().split("\n").at(-1)).toMatch(/call the report tool/i);
  });
});
