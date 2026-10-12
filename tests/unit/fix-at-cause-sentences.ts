import { expect } from "vitest";

/** The sentences that the prompts of the agents that fix findings or errors share: what a real fix is, why hiding is worse, and what to do when no honest fix exists. */
export function expectFixAtItsCause(instructions: string): void {
  expect(instructions).toContain("a repeated value becomes a named constant where it belongs, or the repetition is removed; a long function is split along its steps");
  expect(instructions).toContain("a constant imported from an unrelated module ties modules together for no reason");
  expect(instructions).toContain("Code that serves the project's own checks, such as the patterns a checker forbids or the way test reports are read, is not where");
  expect(instructions).toContain("changing it to make a test or a check pass changes the rules, not the code.");
  expect(instructions).toContain("If no honest fix exists, call the report tool with status blocked, reason other and the detail, instead of forcing one.");
}
