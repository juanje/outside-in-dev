Feature: A line where no scenario starts is a usage error

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
  Scenario: A Red at a line where no scenario starts is refused with the location
    When I run "oid verify red features/greeting.feature:6"
    Then the command fails
    And the error output contains "features/greeting.feature:6"
    And the error output contains "no scenario starts"
    And the output does not contain "test_bug"

  @FR-VERIFY-02
  Scenario: A Red at a line where no scenario starts records no observation and no checkpoint
    When I run "oid verify red features/greeting.feature:6"
    Then the command fails
    And no observation is recorded
    And no checkpoint is recorded
