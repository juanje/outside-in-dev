import { rejection, renderRejection } from "../../src/artifacts/rejection.js";

/** A rejection whose three parts are made from one word, to test what carries a rejection from one place to another. */
export function rejectionOf(word: string) {
  return rejection({ failed: word, evidence: `evidence of ${word}`, next: `next after ${word}` });
}

/** What a command prints for a rejection with these three parts: the rejection and a line break. */
export function printedParts(failed: string, evidence: string, next: string): string {
  return `${renderRejection(rejection({ failed, evidence, next }))}\n`;
}

/** What `oid verify green` prints for these problems. */
export function printedGreen(problems: string[]): string {
  return printedParts(`green: ${problems.length} problem(s)`, problems.join("\n"), "fix the code, not the tests, for each problem listed (or the target you gave, for a target problem), then run oid verify green again");
}

const WRITING_TESTS = ["bdd_red", "tdd_red"];
const WRITING_CODE = ["tdd_green", "refactor"];

/** What `oid verify integrity` prints for these violations of the rules of `step` by the feature `feature`: the move that allows the change depends on the step. */
export function printedIntegrity(step: string, feature: string, violations: string[]): string {
  const next = WRITING_TESTS.includes(step)
    ? `undo the changes listed; if the code is meant to make a verified Red pass, verify the Red and move to tdd_green first (oid progress step ${feature} tdd_green)`
    : WRITING_CODE.includes(step)
      ? `undo the changes to tests listed, or go back to tdd_red for a unit test (oid progress step ${feature} tdd_red, ADR-044) or to bdd_red for a step or a feature file (oid progress step ${feature} bdd_red, ADR-038)`
      : `undo the changes listed: this step changes no code and no tests; to change one, go back to the step that owns the file (oid progress step ${feature} tdd_red or bdd_red)`;
  return printedParts(`integrity: ${violations.length} violation(s) at ${step}`, violations.join("\n"), next);
}

/** What `rejectionOf` prints. */
export function printedRejectionOf(word: string): string {
  return renderRejection(rejectionOf(word));
}
