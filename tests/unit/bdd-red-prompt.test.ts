import { describe, expect, it } from "vitest";
import { bddRedPrompt } from "../../src/agents/prompts/bdd-red.js";
import { expectIntro, expectNoStackNames, expectProcedure } from "./prompt-parts.js";
import { expectAccess, profileOf } from "./prompt-profile.js";

const TARGET = "features/a.feature:12";

describe("the instructions of the agent that writes step definitions", () => {
  it("open with its identity and the shared start of an agent that checks its work, once, without the trait of the agents that change code, and end with the report", () => {
    const instructions = bddRedPrompt("FR-A-02", TARGET, profileOf("BDD_RED"));
    expectIntro(instructions, "workflow");
    expectProcedure(instructions);
    expectNoStackNames(instructions);
  });

  it("name the requirement and give the scenario to try as the target, also for a dry run", () => {
    const instructions = bddRedPrompt("FR-A-02", TARGET, profileOf("BDD_RED"));
    expect(instructions).toContain("FR-A-02");
    expect(instructions).toContain(`target "${TARGET}"`);
    expect(instructions).toContain("`dry_run`");
  });

  it("generate the access it states from its profile", () => {
    expectAccess("BDD_RED", (profile) => bddRedPrompt("FR-A-02", TARGET, profile));
  });
});
