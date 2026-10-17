import { RED_CLASS, type RedClass } from "./red-classification.js";

/** What a test that is not a valid Red showed: the class of what the run showed, whether the test passed, and how the reader is to check the fix (the tail of the sentence). */
export type InvalidRed = { class: RedClass; passed: boolean; then: string; undefinedSteps?: boolean };

/** What to do about a test that is not a valid Red: a test that passes tests a behaviour that exists, steps with no definition are to be defined, one that fails in the environment needs the runner fixed, and any other failure is a broken test. */
export function redNext({ class: kind, passed, then, undefinedSteps = false }: InvalidRed): string {
  if (passed) return `test a behaviour the code does not have yet, then ${then}`;
  if (undefinedSteps) return `define the steps listed in a step file, with the text the scenario words them with, then ${then}`;
  if (kind === RED_CLASS.environment) return `fix what stops the runner from running the test, then ${then}`;
  return `fix the test so that it fails because the behaviour is missing, not because the test is broken, then ${then}`;
}
