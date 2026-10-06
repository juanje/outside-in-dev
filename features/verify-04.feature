@FR-VERIFY-04
Feature: Verify a Green without regressions

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

  Scenario: A Green with no regression passes and is checkpointed
    When I run "oid verify green"
    Then the command succeeds
    And the output starts with "green: ok"
    And the checkpoint records the step "tdd_green"

  Scenario: A failing unit test, a scenario that was passing and a type error are regressions
    Given the source file "src/greeting.ts" containing:
      """
      export function greet(name: string): string {
        return 42;
      }
      """
    When I run "oid verify green"
    Then the command fails
    And the output starts with "green: 3 problem(s)"
    And the output contains "unit tests/unit/greeting.test.ts > greets by name: AssertionError"
    And the output contains "bdd features/greeting.feature:4 Greet Ann: it says hello"
    And the output contains "type src/greeting.ts:2 TS2322"
    And no checkpoint is recorded

  Scenario: A scenario recorded as passing that no longer exists is a problem
    Given a progress file containing:
      """
      {
        "current_focus": "FR-GREETING-01",
        "features": [
          {
            "id": "FR-GREETING-01",
            "title": "Greeting",
            "status": "in_progress",
            "cycle_step": "tdd_green",
            "scenarios": [
              { "name": "Greet Ann", "bdd": "pass" },
              { "name": "Greet Bob", "bdd": "pass" }
            ]
          }
        ]
      }
      """
    When I run "oid verify green"
    Then the command fails
    And the output starts with "green: 1 problem(s)"
    And the output contains "bdd FR-GREETING-01 Greet Bob: no scenario of that name is tagged with the feature"
    And no checkpoint is recorded

  Scenario: Step files that cucumber could not load are a problem, and no scenario is run
    Given the step definitions file "features/steps/greeting.steps.ts" containing:
      """
      import { Given, Then } from "@cucumber/cucumber";
      import { shout } from "../../src/shout.js";

      Given("the greeting for Ann", function () {});

      Then("it says hello", function () {
        shout("Ann");
      });
      """
    When I run "oid verify green"
    Then the command fails
    And the output starts with "green: 1 problem(s)"
    And the output contains "features/steps/greeting.steps.ts:2 imports shout from \"../../src/shout.js\", which does not exist yet"
    And no checkpoint is recorded
