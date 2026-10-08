@FR-VERIFY-04
Feature: A green runs the scenarios of the features it verifies, not those of the whole project

  Background:
    Given a TypeScript project with BDD scenarios
    And the source file "src/greeting.ts" containing:
      """
      export function greet(name: string): string {
        return `Hello, ${name}`;
      }
      """
    And the source file "src/farewell.ts" containing:
      """
      export function farewell(name: string): string {
        return `Bye, ${name}`;
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
    And the feature file "features/farewell.feature" containing:
      """
      @FR-FAREWELL-01
      Feature: Farewell

        Scenario: Farewell Ann
          Given the farewell for "Ann"
          Then it says bye to "Ann"

        Scenario: Farewell Bob
          Given the farewell for "Bob"
          Then it says bye to "Bob"
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
    And the step definitions file "features/steps/farewell.steps.ts" containing:
      """
      import { Given, Then } from "@cucumber/cucumber";
      import assert from "node:assert/strict";

      Given("the farewell for {string}", async function (name: string) {
        const { farewell } = await import("../../src/farewell.js");
        this.text = farewell(name);
      });

      Then("it says bye to {string}", function (name: string) {
        assert.equal(this.text, `Bye, ${name}`);
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
          },
          {
            "id": "FR-FAREWELL-01",
            "title": "Farewell",
            "status": "in_progress",
            "cycle_step": "tdd_green",
            "scenarios": [
              { "name": "Farewell Ann", "bdd": "pass" },
              { "name": "Farewell Bob", "bdd": "pass" }
            ]
          }
        ]
      }
      """
    And the project is a git repository with its files committed

  Scenario: A passing scenario of another feature that now fails does not fail a green
    Given the source file "src/farewell.ts" containing:
      """
      export function farewell(name: string): string {
        return `Gone, ${name}`;
      }
      """
    When I run "oid verify green"
    Then the command succeeds
    And the output starts with "green: ok"
    And the checkpoint of "FR-GREETING-01" lists the scenario "Greet Ann"

  Scenario: A passing scenario of the feature in focus that now fails fails the green, and one of another feature is not reported
    Given the source file "src/greeting.ts" containing:
      """
      export function greet(name: string): string {
        return `Hi, ${name}`;
      }
      """
    And the source file "src/farewell.ts" containing:
      """
      export function farewell(name: string): string {
        return `Gone, ${name}`;
      }
      """
    When I run "oid verify green"
    Then the command fails
    And the output contains "bdd features/greeting.feature:4 Greet Ann: it says hello"
    And the output does not contain "Farewell"
    And no checkpoint is recorded

  Scenario: A green with a target also runs the passing scenarios of the target's feature
    Given the source file "src/farewell.ts" containing:
      """
      export function farewell(name: string): string {
        return name === "Ann" ? `Bye, ${name}` : `Gone, ${name}`;
      }
      """
    When I run "oid verify green \"Farewell Ann\""
    Then the command fails
    And the output contains "bdd features/farewell.feature:8 Farewell Bob: it says bye to \"Bob\""
    And no checkpoint is recorded

  Scenario: A green with no focus and no target runs no scenario
    Given a progress file containing:
      """
      {
        "current_focus": null,
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
    And the source file "src/greeting.ts" containing:
      """
      export function greet(name: string): string {
        return `Hi, ${name}`;
      }
      """
    When I run "oid verify green"
    Then the command fails
    And the output starts with "green: 1 problem(s)"
    And the output contains "unit tests/unit/greeting.test.ts > greets by name: AssertionError"
    And the output does not contain "Greet Ann"
    And no checkpoint is recorded

  Scenario: A feature is marked done after a green that ran only its own scenarios
    Given the source file "src/farewell.ts" containing:
      """
      export function farewell(name: string): string {
        return `Gone, ${name}`;
      }
      """
    When I run "oid verify green"
    And I run "oid progress done FR-GREETING-01"
    Then the command succeeds
    And the feature "FR-GREETING-01" has the status "done"
