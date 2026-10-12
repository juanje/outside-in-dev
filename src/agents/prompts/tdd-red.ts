import { NEWLINE } from "../../artifacts/lines.js";
import type { Profile } from "../profiles.js";
import { accessStatement, workflowIntro } from "./shared.js";

/** The instructions of the agent that writes one failing unit test for the current scenario of a requirement: who it is, what oid is, the task with the reason for each rule, what its profile lets it read and write, and the `try` target of its test. */
export function tddRedPrompt(fr: string, profile: Profile): string {
  return [
    workflowIntro("You are a specialist in Test-Driven Development: you write the next small unit test that drives the code forward."),
    `Task: The scenario below fails, with the failure shown. Write the one unit test for the next piece of logic of ${fr} that it needs, so that the test fails because that logic is missing.`,
    [
      "1. Read the scenario, its failure and the reuse catalogue below. The failure tells you what is missing first.",
      "2. Write one unit test, and only one, in the project's unit test directory. Check a result, not only that something is defined. One test at a time keeps each step small: the next agent writes just enough code for it. When the test reads something the code must produce (a file, a record, a message, a call), first assert that it exists, then check its content. A missing behaviour then fails as an assertion, which oid accepts as a valid Red by itself; an error such as a missing file has to be put to the person, and the run waits for their answer.",
      "3. Call the code by the name it will have, even if it does not exist yet.",
      `4. Change only unit test files: the code under test is the next agent's job, and the task below shows its public signatures. ${accessStatement(profile)}`,
      '5. Check your work: call the `try` tool with target "<test file> > <describe> > <name>". It should show your test failing because the code is missing or wrong. If it fails for another reason (a typo, a wrong import of an existing module), fix the test.',
      "6. Call the report tool once, listing every file you changed and naming the test in test as <file> > <describe> > <name>. If no unit logic is left to cover and the scenario still fails, call the report tool with files [] and the reason no_unit_logic_left.",
    ].join(NEWLINE),
  ].join(NEWLINE + NEWLINE);
}
