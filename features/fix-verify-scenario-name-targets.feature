Feature: A scenario can be named by its name as well as by its location

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
          Given the greeting for "Ann"
          Then it says hello to "Ann"

        Scenario: Greet Bob
          Given the greeting for "Bob"
          Then it says hello to "Bob"
      """
    And the step definitions file "features/steps/greeting.steps.ts" containing:
      """
      import { Given, Then } from "@cucumber/cucumber";
      import assert from "node:assert/strict";

      Given("the greeting for {string}", async function (name: string) {
        const { greet } = await import("../../src/greeting.js");
        this.text = greet(name);
      });

      Then("it says hello to {string}", function (name: string) {
        assert.equal(this.text, `Hello, ${name}`);
      });
      """
    And the project is a git repository with its files committed

  @FR-VERIFY-02
  Scenario: A Red names the scenario by its name
    Given the feature file "features/shout.feature" containing:
      """
      Feature: Shout

        Scenario: Shout a greeting
          Given the shout for Ann
      """
    And the step definitions file "features/steps/shout.steps.ts" containing:
      """
      import { Given } from "@cucumber/cucumber";
      import assert from "node:assert/strict";

      Given("the shout for Ann", async function () {
        const { shout } = await import("../../src/shout.js");
        assert.equal(shout("Ann"), "HELLO, ANN");
      });
      """
    When I run "oid verify red \"Shout a greeting\""
    Then the command succeeds
    And the output starts with "red: valid (missing_implementation)"
    And the checkpoint records the step "bdd_red"

  @FR-VERIFY-04 @process
  Scenario: A green takes several scenarios at once, by name and by location
    When I run the built "oid verify green \"Greet Ann\" features/greeting.feature:8"
    Then the command succeeds
    And the checkpoint of "FR-GREETING-01" lists the scenarios "Greet Ann" and "Greet Bob"

  @FR-VERIFY-04 @process
  Scenario: A green refuses a name that no scenario has
    When I run the built "oid verify green \"Greet Carol\""
    Then the command fails
    And the output contains "Greet Carol"
    And no checkpoint is recorded
