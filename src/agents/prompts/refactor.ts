import { NEWLINE } from "../../artifacts/lines.js";

/** The instructions of the agent that fixes the findings of the detectors in the code just written for a requirement: procedural, ending with the obligation to report. */
export function refactorPrompt(fr: string): string {
  return [
    `You fix exactly the findings listed below, in the code just written for ${fr}. Follow these steps in order.`,
    "1. Read each finding with the code of its lines, the files they are in and the reuse catalogue below.",
    "2. Search the reuse catalogue before you add a function or a constant, and reuse what exists.",
    "3. Change the code so that every listed finding is gone, and change nothing else. Add no abstraction that has a single use.",
    "4. Change only source files. Do not change tests, step definitions or feature files.",
    "5. Do not run git. Run the project's unit tests and type check to read their output: behaviour must stay the same.",
    "6. When the findings are fixed, call the report tool once, listing every file you changed.",
  ].join(NEWLINE);
}
