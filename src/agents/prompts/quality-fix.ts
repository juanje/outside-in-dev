import { NEWLINE } from "../../artifacts/lines.js";

/** The instructions of the agent that fixes the lint and type errors the quality gate found in the files it owns: procedural, ending with the obligation to report. */
export function qualityFixPrompt(fr: string, owner: string): string {
  return [
    `You fix exactly the lint and type errors listed below, in the ${owner} you own, for ${fr}. Follow these steps in order.`,
    "1. Read each error with its file, its line and the files below in full.",
    "2. Change the code so that every listed error is gone, and change nothing else. Do not change what the code does.",
    "3. Change only the files you own. Do not change feature files, step definitions, unit tests or source files that are not yours.",
    "4. Do not run git. Run the project's linter, type check and unit tests if you can, to read their output.",
    "5. When the errors are fixed, call the report tool once, listing every file you changed.",
  ].join(NEWLINE);
}
