import { describe, expect, it } from "vitest";
import { codeGreenPrompt } from "../../src/agents/prompts/code-green.js";
import { expectIntro, expectNoStackNames, expectProcedure } from "./prompt-parts.js";

const TARGET = "tests/unit/cart.test.ts > cart > adds";

describe("the instructions of the agent that writes the minimum code", () => {
  it("open with its identity and the shared start of an agent that changes code, once, and end with the report", () => {
    const instructions = codeGreenPrompt("FR-A-02", TARGET);
    expectIntro(instructions, "code");
    expectProcedure(instructions);
    expectNoStackNames(instructions);
  });

  it("name the requirement and give the test to try as the target", () => {
    const instructions = codeGreenPrompt("FR-A-02", TARGET);
    expect(instructions).toContain("FR-A-02");
    expect(instructions).toContain(`target "${TARGET}"`);
  });
});
