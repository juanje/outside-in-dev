import { NEWLINE } from "../../artifacts/lines.js";

/** The instructions of the agent that writes the step definitions of the first scenario of a requirement: procedural, ending with the obligation to report. */
export function bddRedPrompt(fr: string): string {
  return [
    `You write the step definitions for the first scenario of ${fr}. Follow these steps in order.`,
    "1. Read the scenario, the step definitions that exist and the reuse catalogue below.",
    "2. Reuse a step definition that already matches a step of the scenario; write a new one only for a step that has none.",
    "3. Write the new step definitions in the project's step directory, with real assertions. A step must not be empty, pending or a stub.",
    "4. Import code that does not exist yet dynamically inside the step, never with a static import at the top of the file.",
    "5. Change only step definition files. Do not change feature files, source code or unit tests.",
    "6. Do not run git or tests; the orchestrator runs them when you finish.",
    "7. When the files are written, call the report tool once, listing every file you changed.",
  ].join(NEWLINE);
}
