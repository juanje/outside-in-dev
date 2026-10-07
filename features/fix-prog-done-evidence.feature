@FR-PROG-06
Feature: A feature is done only with current evidence for every scenario

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
            "scenarios": [{ "name": "Greet Ann", "bdd": "pass" }]
          }
        ]
      }
      """
    And the project is a git repository with its files committed

  @process
  Scenario: Marking a feature done without any verification is refused
    When I run the built "oid progress done FR-GREETING-01"
    Then the command fails
    And the error output contains "Greet Ann"
    And the error output contains "oid verify green"
    And the progress file is unchanged

  @process
  Scenario: Marking a feature done after editing a verified file is refused
    When I run the built "oid verify green"
    And the source file "src/greeting.ts" containing:
      """
      export function greet(name: string): string {
        return `Hello, ${name}!`;
      }
      """
    And I run the built "oid progress done FR-GREETING-01"
    Then the command fails
    And the error output contains "src/greeting.ts"
    And the progress file is unchanged

  @process
  Scenario: A feature is marked done after a green that ran every scenario
    When I run the built "oid verify green"
    And I run the built "oid progress done FR-GREETING-01"
    Then the command succeeds
    And the feature "FR-GREETING-01" has the status "done"
