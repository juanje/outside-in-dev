import { describe, expect, it } from "vitest";
import { refactorPrompt } from "../../src/agents/prompts/refactor.js";
import { expectNoLongParagraph, expectSharedTrait } from "./fix-at-cause-sentences.js";

describe("the instructions of the agent that fixes the findings of a Green", () => {
  it("say who it is and what oid is, limit the work to the listed findings in source files with the reason, name the check and end with the report", () => {
    const instructions = refactorPrompt("FR-A-02");
    expect(instructions).toMatch(/^You are a specialist in refactoring: you remove the code-health findings listed below without changing what the code does\./);
    expect(instructions).toMatch(/A program called oid orchestrates it/);
    expect(instructions).toContain("in the code just written for FR-A-02");
    expect(instructions).toMatch(/1\. /);
    expect(instructions).toMatch(/reuse catalogue/i);
    expect(instructions).toMatch(/change nothing else/i);
    expect(instructions).toMatch(/change only source files/i);
    expect(instructions).toMatch(/call the `try` tool with the target of a test that covers the code you changed/);
    expect(instructions).not.toMatch(/outside-in|vitest|cucumber|tsc/i);
    expect(instructions.trimEnd().split("\n").at(-1)).toMatch(/call the report tool/i);
  });

  it("say that a finding is fixed at its cause and not hidden, and what to do when no honest fix exists", () => {
    const instructions = refactorPrompt("FR-A-02");
    expect(instructions).toContain("3. Change the code so that every listed finding is gone, and change nothing else: anything more can break the tests or raise new findings, and oid rejects the attempt. Add no abstraction that has a single use. Fix each finding at its cause: a repeated value becomes a named constant where it belongs, or the repetition is removed; a long function is split along its steps. A constant imported from an unrelated module, or one whose name only repeats its value, hides the finding instead of fixing it; if the only fix would touch code that has nothing to do with the finding, report blocked.");
  });

  it("hold the shared fix-at-cause trait once and no longer the long paragraph", () => {
    const instructions = refactorPrompt("FR-A-02");
    expectSharedTrait(instructions);
    expectNoLongParagraph(instructions);
  });
});
