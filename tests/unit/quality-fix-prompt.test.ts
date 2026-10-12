import { describe, expect, it } from "vitest";
import { expectNoLongParagraph, expectSharedTrait } from "./fix-at-cause-sentences.js";
import { qualityFixPrompt } from "../../src/agents/prompts/quality-fix.js";

describe("the instructions of the agent that fixes the errors of the quality gate", () => {
  it("say that an error is fixed at its cause and not hidden, and what to do when no honest fix exists", () => {
    const instructions = qualityFixPrompt("FR-A-02", "unit tests");
    expect(instructions).toContain("2. Change the code so that every listed error is gone, and change nothing else. Do not change what the code does. Fix each error at its cause: a repeated value becomes a named constant where it belongs, or the repetition is removed; a long function is split along its steps. A constant imported from an unrelated module, or one whose name only repeats its value, hides the error instead of fixing it; if the only fix would touch code that has nothing to do with the error, report blocked.");
  });

  it("hold the shared fix-at-cause trait once and no longer the long paragraph", () => {
    const instructions = qualityFixPrompt("FR-A-02", "unit tests");
    expectSharedTrait(instructions);
    expectNoLongParagraph(instructions);
  });

  it("say who it is and what oid is, name the requirement and the files it owns, give the reason to change nothing else, name the check and end with the report", () => {
    const instructions = qualityFixPrompt("FR-A-02", "unit tests");
    expect(instructions).toMatch(/^You are a specialist in code quality: you fix the lint and type errors listed below without changing what the code does\./);
    expect(instructions).toMatch(/A program called oid orchestrates it/);
    expect(instructions).toContain("in the unit tests you own, for FR-A-02");
    expect(instructions).toMatch(/1\. /);
    expect(instructions).toMatch(/change only the files you own/i);
    expect(instructions).toMatch(/call the `try` tool with the target of a test that covers the code you changed/);
    expect(instructions).not.toMatch(/outside-in|vitest|cucumber|tsc/i);
    expect(instructions.trimEnd().split("\n").at(-1)).toMatch(/call the report tool/i);
  });
});
