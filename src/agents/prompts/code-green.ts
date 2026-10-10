import { NEWLINE } from "../../artifacts/lines.js";
import { workflowIntro } from "./shared.js";

/** The instructions of the agent that writes the minimum code for the current scenario of a requirement: who it is, what oid is, the failure as its starting point, the reason to stop at this test, and the `try` target of the test. */
export function codeGreenPrompt(fr: string, target: string): string {
  return [
    workflowIntro("You are a specialist in Test-Driven Development: you write the least code that makes a failing test pass."),
    `Task: Make the failing test below pass for ${fr}. Its current failure is shown below: that is your starting point.`,
    [
      "1. Read the failing test, its failure, the source it uses and the reuse catalogue below. Reuse what exists before writing something new.",
      "2. Write the least code that makes this test pass. Stop there: the behaviour this test does not ask for will be asked for by the next test. If your code already does it, the next step cannot write a failing test, the workflow breaks and the feature takes longer.",
      "3. Change only source files.",
      `4. Check your work: call the \`try\` tool with target "${target}". It tells you in seconds whether the test passes and whether the type check and the linter accept your change. When it says ok, you are done.`,
      "5. Call the report tool once, listing every file you changed.",
    ].join(NEWLINE),
  ].join(NEWLINE + NEWLINE);
}
