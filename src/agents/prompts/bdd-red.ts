import { NEWLINE } from "../../artifacts/lines.js";
import type { Profile } from "../profiles.js";
import { accessStatement, workflowIntro } from "./shared.js";

/** The instructions of the agent that writes the step definitions of the first scenario of a requirement: who it is, what oid is, the task with the reason for each rule, what its profile lets it read and write, and the `try` target of the scenario. */
export function bddRedPrompt(fr: string, target: string, profile: Profile): string {
  return [
    workflowIntro("You are a specialist in Behaviour-Driven Development and test automation: you write the step definitions that turn a Gherkin scenario into an executable test."),
    `Task: Write the step definitions for the scenario of ${fr} below, so that it runs and fails because the feature does not exist yet. That failure is the goal of this step: the next steps will write the code that makes it pass.`,
    [
      "1. Read the scenario, the step definitions that exist and the reuse catalogue below.",
      "2. Reuse an existing step definition only when its text matches the step exactly. A step that only looks similar needs a new definition: changing a shared step to fit yours breaks the scenarios that already use it, and oid will reject the attempt.",
      "3. Write each new step with a real assertion, never empty or pending. Import code that does not exist yet dynamically inside the step, not at the top of the file, so the file still loads. Import only code the feature itself needs: a function that exists only so your step can observe something is not part of the feature, and the next agents would have to invent it.",
      `4. Change only step definition files: the code the steps call does not exist yet, and writing it is the next agent's job. ${accessStatement(profile)}`,
      `5. Check your work: call the \`try\` tool with target "${target}" and \`dry_run\` true to list any step that still has no definition, in seconds. Then call the \`try\` tool with target "${target}": it should fail in a Then step, because the feature is missing. A failure in a Given or in the Background means your setup is wrong, not that the feature is missing.`,
      "6. If the scenario passes as soon as its steps exist, because what it describes already holds without new code (for example, nothing happens when nothing is configured), that is a correct result, not a mistake to fix. Do not make it fail: a step that needs code which does not exist, or a check written so that it fails, sends the next agents to write code that serves only your step. Call the report tool as done; oid then asks the person whether to keep the scenario as a guard against regressions.",
      "7. Call the report tool once, listing every file you changed.",
    ].join(NEWLINE),
  ].join(NEWLINE + NEWLINE);
}
