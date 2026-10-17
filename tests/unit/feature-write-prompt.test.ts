import { describe, expect, it } from "vitest";
import { featureWritePrompt } from "../../src/agents/prompts/feature-write.js";
import { expectIntro, expectNoStackNames, expectProcedure } from "./prompt-parts.js";
import { expectAccess, profileOf } from "./prompt-profile.js";

describe("the instructions of the agent that writes the feature files", () => {
  it("open with its identity and the shared start of the agent that has no suites to run, once, and end with the report", () => {
    const instructions = featureWritePrompt("FR-A-02", profileOf("FEATURE_WRITE"));
    expectIntro(instructions, "feature");
    expectProcedure(instructions);
    expectNoStackNames(instructions);
  });

  it("name the requirement, tag the Feature line with it and offer no try tool", () => {
    const instructions = featureWritePrompt("FR-A-02", profileOf("FEATURE_WRITE"));
    expect(instructions).toContain("FR-A-02");
    expect(instructions).toContain("@FR-A-02");
    expect(instructions).not.toContain("`try`");
  });

  it("generate the access it states from its profile, which reads the design notes", () => {
    expectAccess("FEATURE_WRITE", (profile) => featureWritePrompt("FR-A-02", profile));
    expect(profileOf("FEATURE_WRITE").read).toContain("docs/design.md");
  });
});
