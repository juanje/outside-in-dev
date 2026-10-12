import { describe, expect, it } from "vitest";
import { featureWritePrompt } from "../../src/agents/prompts/feature-write.js";

describe("the instructions of the agent that writes the feature files", () => {
  it("say who it is and what oid is, give the reason for observable scenarios and for milestones, tag the Feature line, offer no try tool and end with the report", () => {
    const instructions = featureWritePrompt("FR-A-02");
    expect(instructions).toMatch(/^You are a specialist in Behaviour-Driven Development: you write Gherkin feature files that describe, in the language of the user, what a requirement must do\./);
    expect(instructions).toMatch(/A program called oid orchestrates it/);
    expect(instructions).toContain("Write the feature file for FR-A-02. Every scenario will later be turned into an executable test");
    expect(instructions).toMatch(/1\. /);
    expect(instructions).toMatch(/Abstract steps such as "When the system handles it" cannot be turned into a test that proves anything/);
    expect(instructions).toMatch(/Check milestones, not where the whole process ends/);
    expect(instructions).toMatch(/when the feature is not configured, and when the thing it depends on fails/);
    expect(instructions).toContain("Tag the Feature line with @FR-A-02");
    expect(instructions).not.toMatch(/`try`|full test suites/);
    expect(instructions).not.toMatch(/outside-in|vitest|cucumber|tsc/i);
    expect(instructions.trimEnd().split("\n").at(-1)).toMatch(/call the report tool/i);
  });

  it("says plainly that the exit code, the last line and the final state are where the process ends, and asks for the observable fact that proves the behaviour", () => {
    const rule = featureWritePrompt("FR-A-02").split("\n").find((line) => /^4\. /.test(line))!;
    expect(rule).toContain("Check milestones, not where the whole process ends");
    expect(rule).toMatch(/exit code, the last line of the output and the final state/);
    expect(rule).toMatch(/a recorded event or transition, a file, a saved value or a received message/);
  });

  it("shows a good and a bad scenario in a neutral domain, with the cost of the bad one, and says what the project examples are for", () => {
    const instructions = featureWritePrompt("FR-A-02");
    expect(instructions).toContain("Example in a neutral domain (a library loan), only to show the shape; do not copy it:");
    expect(instructions).toContain('Good:\n  Scenario: A loan is recorded when a member borrows a book\n    Given a member with no loans\n    When the member borrows "Dune"\n    Then the loans of the member list "Dune"\n    And a "loan_created" event is recorded');
    expect(instructions).toContain('Bad:\n  Scenario: Borrowing works\n    Given the system is set up\n    When the system handles the loan\n    Then the command exits with code 0\n    And the last line says "done"');
    expect(instructions).toContain("Why the bad one costs you: its steps cannot be turned into a test, and it checks where the process ends, so it breaks when a later requirement makes the process go further.");
    expect(instructions).toContain("The example feature files and the step definitions below show the vocabulary and the setup of the project to reuse; your scenarios describe your requirement, not theirs.");
    expect(instructions).not.toMatch(/outside-in|vitest|cucumber|tsc/i);
  });

  it("tells the writer to prefer the step definitions that exist, with the reason in terms of the work saved, and to write a new step only for what none of them says", () => {
    const instructions = featureWritePrompt("FR-A-02");
    expect(instructions).toContain("Prefer the step definitions that exist, listed below");
    expect(instructions).toMatch(/a scenario written with existing steps runs on a setup that already works/);
    expect(instructions).toMatch(/each new step is code that the next step must write and keep/);
    expect(instructions).toMatch(/write a new step only for what none of them says/);
  });

  it("states in the last rule before the report what the feature writer may read and write, with the reason", () => {
    const rules = featureWritePrompt("FR-A-02").split("\n").filter((line) => /^\d\. /.test(line));
    expect(rules.at(-2)).toBe(
      "7. You may read the requirement, its design notes, the domain notes and the feature files, and you may write only the feature file: the step definitions, the tests and the code come from the next steps. A path you may not read is refused at once; do not search for it.",
    );
  });
});
