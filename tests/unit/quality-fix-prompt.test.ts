import { describe, expect, it } from "vitest";
import { qualityFixPrompt } from "../../src/agents/prompts/quality-fix.js";
import { expectIntro, expectNoStackNames, expectProcedure } from "./prompt-parts.js";

describe("the instructions of the agent that fixes the errors of the quality gate", () => {
  it("open with its identity and the shared start of an agent that changes code, once, and end with the report", () => {
    const instructions = qualityFixPrompt("FR-A-02", "unit tests");
    expectIntro(instructions, "code");
    expectProcedure(instructions);
    expectNoStackNames(instructions);
  });

  it("name the requirement and the files it owns", () => {
    const instructions = qualityFixPrompt("FR-A-02", "unit tests");
    expect(instructions).toContain("FR-A-02");
    expect(instructions).toContain("unit tests");
  });
});
