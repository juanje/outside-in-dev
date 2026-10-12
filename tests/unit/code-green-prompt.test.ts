import { describe, expect, it } from "vitest";
import { codeGreenPrompt } from "../../src/agents/prompts/code-green.js";
import { expectNoLongParagraph, expectSharedTrait } from "./fix-at-cause-sentences.js";

describe("the instructions of the agent that writes the minimum code", () => {
  it("say who it is and what oid is, start from the failure of the test, give the reason to stop at this test, name the target to try and end with the report", () => {
    const instructions = codeGreenPrompt("FR-A-02", "tests/unit/cart.test.ts > cart > adds");
    expect(instructions).toMatch(/^You are a specialist in Test-Driven Development: you write the least code that makes a failing test pass\./);
    expect(instructions).toMatch(/A program called oid orchestrates it/);
    expect(instructions).toMatch(/Make the failing test below pass for FR-A-02\. Its current failure is shown below: that is your starting point/);
    expect(instructions).toMatch(/1\. /);
    expect(instructions).toMatch(/reuse what exists before writing something new/i);
    expect(instructions).toMatch(/the next step cannot write a failing test, the workflow breaks/);
    expect(instructions).toMatch(/change only source files/i);
    expect(instructions).toContain('call the `try` tool with target "tests/unit/cart.test.ts > cart > adds"');
    expect(instructions).not.toMatch(/outside-in|vitest|cucumber|tsc/i);
    expect(instructions.trimEnd().split("\n").at(-1)).toMatch(/call the report tool/i);
  });

  it("ask for the behaviour the test describes and not for a special case, and say that a check is satisfied at its cause, not hidden", () => {
    const instructions = codeGreenPrompt("FR-A-02", "tests/unit/cart.test.ts > cart > adds");
    expect(instructions).toContain("through the behaviour the test describes, not through a special case that exists only for this test: the next scenarios need the real behaviour");
    expect(instructions).toContain("3. Change only source files. Fix each finding or failing check at its cause: a repeated value becomes a named constant in the module it belongs to, a long function is split along its steps. A constant imported from an unrelated module, or one whose name only repeats its value, hides the finding instead of fixing it.");
  });

  it("hold the shared fix-at-cause trait once and no longer the long paragraph", () => {
    const instructions = codeGreenPrompt("FR-A-02", "tests/unit/cart.test.ts > cart > adds");
    expectSharedTrait(instructions);
    expectNoLongParagraph(instructions);
  });
});
