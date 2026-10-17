import { describe, expect, it } from "vitest";
import { refactorPrompt } from "../../src/agents/prompts/refactor.js";
import { expectIntro, expectNoStackNames, expectProcedure } from "./prompt-parts.js";

describe("the instructions of the agent that fixes the findings of a Green", () => {
  it("open with its identity and the shared start of an agent that changes code, once, and end with the report", () => {
    const instructions = refactorPrompt("FR-A-02");
    expectIntro(instructions, "code");
    expectProcedure(instructions);
    expectNoStackNames(instructions);
  });

  it("name the requirement", () => {
    expect(refactorPrompt("FR-A-02")).toContain("FR-A-02");
  });
});
