Feature: A failing assertion on a line added since the checkpoint is a valid Red

  Background:
    Given a TypeScript project with BDD scenarios
    And the source file "src/greeting.ts" containing:
      """
      export function greet(name: string): string {
        return `Hello, ${name}`;
      }
      """
    And the project is a git repository with its files committed

  @FR-VERIFY-01
  Scenario: A failing assertion in a new test is a valid Red without a decision
    Given the unit test file "tests/unit/greeting.test.ts" containing:
      """
      import { expect, it } from "vitest";
      import { greet } from "../../src/greeting.js";

      it("greets informally", () => {
        expect(greet("Ann")).toBe("Hi, Ann");
      });
      """
    When I run "oid verify red \"tests/unit/greeting.test.ts > greets informally\""
    Then the command succeeds
    And the output starts with "red: valid (business_assertion)"
    And the checkpoint records the step "tdd_red"

  @FR-VERIFY-01
  Scenario: A failing assertion added to a committed test file is a valid Red, one that was committed still needs a decision
    Given the unit test file "tests/unit/greeting.test.ts" containing:
      """
      import { expect, it } from "vitest";
      import { greet } from "../../src/greeting.js";

      it("greets formally", () => {
        expect(greet("Ann")).toBe("Good day, Ann");
      });
      """
    And the changes are committed
    And the unit test file "tests/unit/greeting.test.ts" is changed to:
      """
      import { expect, it } from "vitest";
      import { greet } from "../../src/greeting.js";

      it("greets formally", () => {
        expect(greet("Ann")).toBe("Good day, Ann");
      });

      it("greets informally", () => {
        expect(greet("Ann")).toBe("Hi, Ann");
      });
      """
    When I run "oid verify red \"tests/unit/greeting.test.ts > greets formally\""
    Then the command needs a decision
    When I run "oid verify red \"tests/unit/greeting.test.ts > greets informally\""
    Then the command succeeds
    And the output starts with "red: valid (business_assertion)"

  @FR-VERIFY-02
  Scenario: A failing assertion in a new step is a valid Red without a decision
    Given the feature file "features/greeting.feature" containing:
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
    When I run "oid verify red features/greeting.feature:3"
    Then the command succeeds
    And the output starts with "red: valid (business_assertion)"
    And the checkpoint records the step "bdd_red"
