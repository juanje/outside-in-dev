import { describe, expect, it } from "vitest";
import { codeGreenPrompt } from "../../src/agents/prompts/code-green.js";

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
    expect(instructions).toContain("A finding or a check that complains about your code points at code that is harder to read and change: the goal is clearer code, not a quieter detector.");
    expect(instructions).toContain("a repeated value becomes a named constant in the module it belongs to, a long function is split along its steps");
    expect(instructions).toContain("a constant imported from an unrelated module ties modules together for no reason");
    expect(instructions).toContain("the attempt is rejected and the work is redone, which costs more than the plain fix");
    expect(instructions).toContain("Code that serves the project's own checks, such as the patterns a checker forbids or the way test reports are read, is not where a finding in other code is fixed: changing it to make a test or a check pass changes the rules, not the code.");
    expect(instructions).toContain("If no honest fix exists, call the report tool with status blocked, reason other and the detail, instead of forcing one.");
  });
});
