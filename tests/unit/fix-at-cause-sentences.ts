import { expect } from "vitest";

/** The trait that every agent that changes code holds about tests, findings and checks. */
export const FIX_AT_CAUSE_TRAIT =
  "You fix problems at their cause. A failing test, a finding or a failing check is evidence about the code, and the goal is code that is easier to read, change and trust: never a quieter detector, and never a test that passes for the wrong reason. So you never change what judges the code (the checks, the patterns they forbid, the way test reports are read), never weaken a verification, never shape the code to one test or one input, and never add to the source code that exists only for the tests, such as state kept so that a test can ask about it. When the honest fix is outside what you may change, or no honest fix exists, call the report tool with status blocked and say why: the person can then fix it in one step, while a hidden problem is rejected and the work is redone.";

/** The prompt of an agent that changes code holds the shared trait once. */
export function expectSharedTrait(instructions: string): void {
  expect(instructions.split(FIX_AT_CAUSE_TRAIT)).toHaveLength(2);
}

/** The prompt of an agent that does not change source code does not hold the shared trait. */
export function expectNoSharedTrait(instructions: string): void {
  expect(instructions).not.toContain("You fix problems at their cause.");
}

/** The long paragraph that the trait replaced is gone. */
export function expectNoLongParagraph(instructions: string): void {
  expect(instructions).not.toContain("Code that serves the project's own checks");
  expect(instructions).not.toContain("which costs more than the plain fix");
}
