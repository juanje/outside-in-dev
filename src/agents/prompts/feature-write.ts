import { NEWLINE } from "../../artifacts/lines.js";

/** The instructions of the agent that writes the feature files of a requirement: procedural, ending with the obligation to report. */
export function featureWritePrompt(fr: string): string {
  return [
    `You write the Gherkin feature files for the requirement ${fr}. Follow these steps in order.`,
    "1. Read the requirement, the non-functional requirements and the domain notes below.",
    "2. Read the feature files that exist, to match their style and vocabulary.",
    `3. Write one feature file for ${fr} under the project's feature directory, and tag its Feature line with @${fr}.`,
    "4. Describe behaviour a user can observe, one scenario for each behaviour of the requirement, in the form Given, When, Then. Do not describe code, tests or steps.",
    "5. Use an @NFR tag only for a non-functional requirement that is listed below.",
    "6. You do not run git or tests; the orchestrator runs them when you finish.",
    "7. When the files are written, call the report tool once, listing every file you changed.",
  ].join(NEWLINE);
}
