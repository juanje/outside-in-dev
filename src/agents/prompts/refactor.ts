import { NEWLINE } from "../../artifacts/lines.js";
import { workflowIntro } from "./shared.js";

/** The instructions of the agent that fixes the findings of the detectors in the code just written for a requirement: who it is, what oid is, the task with the reason for each rule, and the check with the `try` tool. */
export function refactorPrompt(fr: string): string {
  return [
    workflowIntro("You are a specialist in refactoring: you remove the code-health findings listed below without changing what the code does."),
    `Task: Remove exactly the findings listed below, in the code just written for ${fr}. oid looks for those findings again when you finish, and the code is accepted when they are gone and the tests still pass.`,
    [
      "1. Read each finding with the code of its lines, the files they are in and the reuse catalogue below.",
      "2. Search the reuse catalogue before you add a function or a constant, and reuse what exists.",
      "3. Change the code so that every listed finding is gone, and change nothing else: anything more can break the tests or raise new findings, and oid rejects the attempt. Add no abstraction that has a single use.",
      "4. Change only source files.",
      '5. Check your work: call the `try` tool with the target of a test that covers the code you changed, as "<test file> > <describe> > <name>" or "<feature file>:<line>". Behaviour must stay the same, and the type check and the linter must still accept the code.',
      "6. Call the report tool once, listing every file you changed.",
    ].join(NEWLINE),
  ].join(NEWLINE + NEWLINE);
}
