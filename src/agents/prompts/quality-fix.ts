import { NEWLINE } from "../../artifacts/lines.js";
import { workflowIntro } from "./shared.js";

/** The instructions of the agent that fixes the lint and type errors the quality gate found in the files it owns: who it is, what oid is, the task with the reason for each rule, and the check with the `try` tool. */
export function qualityFixPrompt(fr: string, owner: string): string {
  return [
    workflowIntro("You are a specialist in code quality: you fix the lint and type errors listed below without changing what the code does."),
    `Task: Fix exactly the errors listed below, in the ${owner} you own, for ${fr}. oid's quality gate found them and runs again when you finish.`,
    [
      "1. Read each error with its file, its line and the files below in full.",
      "2. Change the code so that every listed error is gone, and change nothing else. Do not change what the code does. The errors point at code that is harder to read and change: the goal is clearer, correct code, not a quieter checker. Fix each at its cause: a repeated value becomes a named constant where it belongs, or the repetition is removed; a long function is split along its steps. Hiding an error makes the code worse (a constant imported from an unrelated module ties modules together for no reason), and the attempt is rejected and the work is redone, which costs more than the plain fix. Code that serves the project's own checks, such as the patterns a checker forbids or the way test reports are read, is not where an error in other code is fixed: changing it to make a test or a check pass changes the rules, not the code. If no honest fix exists, call the report tool with status blocked, reason other and the detail, instead of forcing one.",
      "3. Change only the files you own: the other files belong to other steps, and oid rejects an attempt that changes them.",
      "4. Check your work: call the `try` tool with the target of a test that covers the code you changed, as \"<test file> > <describe> > <name>\" or \"<feature file>:<line>\". It runs the type check and the linter on the files you changed.",
      "5. Call the report tool once, listing every file you changed.",
    ].join(NEWLINE),
  ].join(NEWLINE + NEWLINE);
}
