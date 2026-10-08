import { NEWLINE } from "../../artifacts/lines.js";

/** The instructions of the agent that writes one failing unit test for the current scenario of a requirement: procedural, ending with the obligation to report. */
export function tddRedPrompt(fr: string): string {
  return [
    `You write one failing unit test for the current scenario of ${fr}. Follow these steps in order.`,
    "1. Read the scenario, its failure and the reuse catalogue below.",
    "2. Write only one unit test, in the project's unit test directory, for the next piece of logic the scenario needs. Check a result, never only that something is defined.",
    "3. Use the code the test needs by its real name, even if it does not exist yet: the test must fail because that code is missing or wrong.",
    "4. Change only unit test files. Do not change source code, step definitions or feature files.",
    "5. Do not run git or tests; the orchestrator runs them when you finish.",
    "6. When the test is written, call the report tool once, listing every file you changed and naming the test in test as <file> > <describe> > <name>. If no unit logic is left to cover and the scenario still fails, call the report tool with files [] and the reason no_unit_logic_left.",
  ].join(NEWLINE);
}
