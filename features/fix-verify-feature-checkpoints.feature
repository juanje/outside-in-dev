Feature: Each feature keeps its own checkpoint

  @FR-PROG-05
  Scenario: A green of another feature keeps the evidence of a scenario
    Given a tracked feature "FR-X-01" with a scenario "Alpha works" marked "fail"
    And a tracked feature "FR-Y-01" with a scenario "Beta works" marked "fail"
    And the last green ran the scenario "Alpha works" of "FR-X-01"
    And a later green ran the scenario "Beta works" of "FR-Y-01"
    When I run "oid progress scenario pass FR-X-01 \"Alpha works\""
    Then the command succeeds
    And the feature "FR-X-01" has the scenario "Alpha works" marked "pass"

  @FR-VERIFY-05
  Scenario: Integrity compares the changes with the checkpoint of the focused feature
    Given a TypeScript project with unit tests
    And a started feature "FR-X-01" at step "tdd_green"
    And the focus is on "FR-X-01"
    And the project is a git repository with its files committed
    And the unit test file "tests/unit/greeting.test.ts" containing:
      """
      // the test of FR-X-01
      """
    And a verification of "FR-X-01" at step "tdd_red" is recorded
    And the unit test file "tests/unit/greeting.test.ts" is changed to:
      """
      // the test of FR-X-01, changed while FR-Y-01 was verified
      """
    And a verification of "FR-Y-01" at step "tdd_red" is recorded
    When I run "oid verify integrity"
    Then the command fails
    And the output contains "tests/unit/greeting.test.ts changed a test while writing code"

  @FR-VERIFY-05
  Scenario: A feature with no checkpoint of its own is judged against the single checkpoint that names it
    Given a TypeScript project with unit tests
    And a started feature "FR-X-01" at step "tdd_green"
    And the focus is on "FR-X-01"
    And the project is a git repository with its files committed
    And the unit test file "tests/unit/greeting.test.ts" containing:
      """
      // the test of FR-X-01
      """
    And a single checkpoint of "FR-X-01" at step "tdd_red" is recorded
    And the unit test file "tests/unit/greeting.test.ts" is changed to:
      """
      // the test of FR-X-01, changed
      """
    When I run "oid verify integrity"
    Then the command fails
    And the output contains "tests/unit/greeting.test.ts changed a test while writing code"

  @FR-VERIFY-04 @process
  Scenario: A green with a target writes the checkpoint of the target's feature
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
    And the project is a git repository with its files committed
    When I run the built "oid verify green features/greeting.feature:4"
    Then the command succeeds
    And the checkpoint of "FR-GREETING-01" lists the scenario "Greet Ann"
