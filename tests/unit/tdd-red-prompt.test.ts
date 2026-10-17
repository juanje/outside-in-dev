import { describe, expect, it } from "vitest";
import { tddRedPrompt } from "../../src/agents/prompts/tdd-red.js";
import { parseReport } from "../../src/agents/tools/report.js";
import { expectIntro, expectNoStackNames, expectProcedure } from "./prompt-parts.js";
import { expectAccess, profileOf } from "./prompt-profile.js";

/** The reason the prompt gives for ending without a test, which the report tool must accept. */
const NO_UNIT_LOGIC = "no_unit_logic_left";

describe("the instructions of the agent that writes one unit test", () => {
  it("open with its identity and the shared start of an agent that checks its work, once, without the trait of the agents that change code, and end with the report", () => {
    const instructions = tddRedPrompt("FR-A-02", profileOf("TDD_RED"));
    expectIntro(instructions, "workflow");
    expectProcedure(instructions);
    expectNoStackNames(instructions);
  });

  it("name the requirement and the reason to report when no unit logic is left, which the report tool accepts", () => {
    const instructions = tddRedPrompt("FR-A-02", profileOf("TDD_RED"));
    expect(instructions).toContain("FR-A-02");
    expect(instructions).toContain(NO_UNIT_LOGIC);
    expect(parseReport({ status: "done", files: [], summary: "none", reason: NO_UNIT_LOGIC })).toBeDefined();
  });

  it("generate the access it states from its profile", () => {
    expectAccess("TDD_RED", (profile) => tddRedPrompt("FR-A-02", profile));
  });
});
