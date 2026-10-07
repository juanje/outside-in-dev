@FR-PROG-05
Feature: A scenario passes only with a current green that ran it

  Background:
    Given a TypeScript project with BDD scenarios
    And the source file "src/greeting.ts" containing:
      """
      export function greet(name: string): string {
        return `Hello, ${name}`;
      }
      """
    And the unit test file "tests/unit/greeting.test.ts" containing:
      """
      import { expect, it } from "vitest";
      import { greet } from "../../src/greeting.js";

      it("greets by name", () => {
        expect(greet("Ann")).toBe("Hello, Ann");
      });
      """
    And the feature file "features/greeting.feature" containing:
      """
      @FR-GREETING-01
      Feature: Greeting

        Scenario: Greet Ann
          Given the greeting for Ann
          Then it says hello
      """
    And the step definitions file "features/steps/greeting.steps.ts" containing:
      """
      import { Given, Then } from "@cucumber/cucumber";
      import assert from "node:assert/strict";

      Given("the greeting for Ann", async function () {
        const { greet } = await import("../../src/greeting.js");
        this.text = greet("Ann");
      });

      Then("it says hello", function () {
        assert.equal(this.text, "Hello, Ann");
      });
      """
    And a progress file containing:
      """
      {
        "current_focus": "FR-GREETING-01",
        "features": [
          {
            "id": "FR-GREETING-01",
            "title": "Greeting",
            "status": "in_progress",
            "cycle_step": "tdd_green",
            "scenarios": [{ "name": "Greet Ann", "bdd": "fail" }]
          }
        ]
      }
      """
    And the project is a git repository with its files committed

  Scenario: Marking a scenario as passing without any verification is refused
    When I run "oid progress scenario pass FR-GREETING-01 \"Greet Ann\""
    Then the command fails
    And the error output contains "oid verify green features/greeting.feature:4"
    And the progress file is unchanged

  Scenario: Marking a scenario as passing after editing a verified file is refused
    When I run "oid verify green features/greeting.feature:4"
    And the source file "src/greeting.ts" containing:
      """
      export function greet(name: string): string {
        return `Hello, ${name}!`;
      }
      """
    And I run "oid progress scenario pass FR-GREETING-01 \"Greet Ann\""
    Then the command fails
    And the error output contains "src/greeting.ts"
    And the progress file is unchanged

  Scenario: A scenario is accepted as passing after a green that ran it, and the checkpoint lists it
    When I run "oid verify green features/greeting.feature:4"
    When I run "oid progress scenario pass FR-GREETING-01 \"Greet Ann\""
    Then the command succeeds
    And the feature "FR-GREETING-01" has the scenario "Greet Ann" marked "pass"
    And the checkpoint lists the scenario "Greet Ann" of "FR-GREETING-01"

  Scenario: A green with no target does not add a scenario to the evidence
    When I run "oid verify green"
    Then the command succeeds
    And the checkpoint lists no scenario

  Scenario: A green with a target that cannot be located fails and records no checkpoint
    When I run "oid verify green features/greeting.feature:99"
    Then the command fails
    And the output contains "features/greeting.feature:99"
    And no checkpoint is recorded
