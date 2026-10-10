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
});
