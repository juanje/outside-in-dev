import { NEWLINE } from "../../artifacts/lines.js";
import { featureIntro } from "./shared.js";

/** The instructions of the agent that writes the feature file of a requirement: who it is, what oid is, and the task with the reason for each rule. */
export function featureWritePrompt(fr: string): string {
  return [
    featureIntro("You are a specialist in Behaviour-Driven Development: you write Gherkin feature files that describe, in the language of the user, what a requirement must do."),
    `Task: Write the feature file for ${fr}. Every scenario will later be turned into an executable test, and code will be written to make it pass, so each scenario is a promise about behaviour someone can observe.`,
    [
      "1. Read the requirement, its design notes, the non-functional requirements and the domain notes below. The design notes name the exact options, settings, variables and outputs; use those names.",
      "2. Read the example feature files below to match their style and vocabulary.",
      '3. Write one scenario per behaviour, as Given, When, Then. Start each scenario from something the user does (a command they run, with the setup it needs) and check what they can observe afterwards (output, files, recorded events). Abstract steps such as "When the system handles it" cannot be turned into a test that proves anything.',
      "4. Check milestones, not where the whole process ends: a later requirement may make the process go further, and a scenario that asserts its last line would then break.",
      "5. Besides the main behaviour, cover what happens when the feature is not configured, and when the thing it depends on fails. These are the cases users hit first.",
      `6. Tag the Feature line with @${fr}. Use an @NFR tag only for a non-functional requirement listed below.`,
      "7. Call the report tool once, listing the file you wrote.",
    ].join(NEWLINE),
  ].join(NEWLINE + NEWLINE);
}
