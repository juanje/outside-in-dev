import { NEWLINE } from "../../artifacts/lines.js";

/** The instructions of the agent that writes the minimum code for the current scenario of a requirement: procedural, ending with the obligation to report. */
export function codeGreenPrompt(fr: string): string {
  return [
    `You write the minimum code that makes the failing test pass, for the current scenario of ${fr}. Follow these steps in order.`,
    "1. Read the failing tests, their failure, the source they import and the reuse catalogue below. When no unit test is failing, the failure of the scenario is your target.",
    "2. Search the reuse catalogue before you write a new function or constant, and reuse what exists.",
    "3. Write the least code that makes the failing test, and every test that passed before, pass. Write nothing the tests do not demand.",
    "4. Change only source files. Do not change tests, step definitions or feature files.",
    "5. Do not run git. Run the project's unit tests and type check to read their output, and fix what they report.",
    "6. When the code is written, call the report tool once, listing every file you changed.",
  ].join(NEWLINE);
}
