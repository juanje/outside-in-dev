Feature: A decision answers the failure the last verify red recorded

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

      it("greets informally", () => {
        expect(greet("Ann")).toBe("Hi, Ann");
      });
      """
    And the feature file "features/greeting.feature" containing:
      """
      Feature: Greeting

        Scenario: Greet informally
          Given the greeting
          Then it greets Ann informally
      """
    And the step definitions file "features/steps/greeting.steps.ts" containing:
      """
      import { Given, Then } from "@cucumber/cucumber";
      import assert from "node:assert/strict";

      Given("the greeting", function () {});

      Then("it greets Ann informally", async function () {
        const { greet } = await import("../../src/greeting.js");
        assert.equal(greet("Ann"), "Hi, Ann");
      });
      """
    And the project is a git repository with its files committed

  @FR-VERIFY-01
  Scenario: A decision answers the recorded failure of a unit test
    When I run "oid verify red \"tests/unit/greeting.test.ts > greets informally\""
    And I run "oid verify red \"tests/unit/greeting.test.ts > greets informally\" --decide business_assertion"
    Then the command succeeds
    And the output starts with "red: valid (business_assertion)"
    And the checkpoint records the step "tdd_red"
    And the checkpoint records an external decision

  @FR-VERIFY-01
  Scenario: A decision with no recorded failure to answer is refused
    When I run "oid verify red \"tests/unit/greeting.test.ts > greets informally\" --decide business_assertion"
    Then the command fails
    And the error output contains "no recorded run of this target needs a decision"
    And the error output contains "run oid verify red \"tests/unit/greeting.test.ts > greets informally\" first"
    And no checkpoint is recorded

  @FR-VERIFY-01
  Scenario: A decision after the files changed since the recorded failure is refused
    When I run "oid verify red \"tests/unit/greeting.test.ts > greets informally\""
    And the source file "src/greeting.ts" is changed to:
      """
      export function greet(name: string): string {
        return `Hi, ${name}`;
      }
      """
    And I run "oid verify red \"tests/unit/greeting.test.ts > greets informally\" --decide business_assertion"
    Then the command fails
    And the error output contains "src/greeting.ts changed since the run that needs the decision"
    And the error output contains "run oid verify red \"tests/unit/greeting.test.ts > greets informally\" again"
    And no checkpoint is recorded

  @FR-VERIFY-02
  Scenario: A decision answers the recorded failure of a scenario
    When I run "oid verify red features/greeting.feature:3"
    And I run "oid verify red features/greeting.feature:3 --decide business_assertion"
    Then the command succeeds
    And the output starts with "red: valid (business_assertion)"
    And the checkpoint records the step "bdd_red"
    And the checkpoint records an external decision
