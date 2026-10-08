@FR-VERIFY-06
Feature: Fix a step after the code exists

  Background:
    Given a TypeScript project with BDD scenarios
    And the source file "src/greeting.ts" containing:
      """
      export const greeting = "Hello";
      """
    And the feature file "features/farewell.feature" containing:
      """
      @FR-FAREWELL-01
      Feature: Farewell

        Scenario: Say goodbye to Ann
          Then it says goodbye to Ann
      """
    And the step definitions file "features/steps/farewell.steps.ts" containing:
      """
      import { Then } from "@cucumber/cucumber";
      import assert from "node:assert/strict";

      Then("it says goodbye to Ann", async function () {
        const { farewell } = await import("../../src/farewell.js");
        assert.ok(farewell("Ann").includes("Ann"));
      });
      """
    And the project is a git repository with its files committed
    And the focus is on "FR-FAREWELL-01"

  Scenario Outline: A step fixed after the code exists returns the feature to where it came from
    Given a started feature "FR-FAREWELL-01" at step "<came from>"
    And a Red of "FR-FAREWELL-01" was verified at step "tdd_red"
    And the source file "src/farewell.ts" containing:
      """
      export function farewell(name: string): string {
        return `Goodbye, ${name}`;
      }
      """
    When I run "oid progress step FR-FAREWELL-01 bdd_red"
    And the step definitions file "features/steps/farewell.steps.ts" is changed to:
      """
      import { Then } from "@cucumber/cucumber";
      import assert from "node:assert/strict";

      Then("it says goodbye to Ann", async function () {
        const { farewell } = await import("../../src/farewell.js");
        assert.equal(farewell("Ann"), "Goodbye, Ann");
      });
      """
    And I run "oid verify red features/farewell.feature:4"
    Then the command succeeds
    And the output starts with "red: returned to <came from>"
    And the output contains "src/farewell.ts"
    And the feature "FR-FAREWELL-01" has the cycle step "<came from>"
    And the checkpoint records the step "bdd_red"
    And the file "src/farewell.ts" contains:
      """
      export function farewell(name: string): string {
        return `Goodbye, ${name}`;
      }
      """

    Examples:
      | came from |
      | tdd_green |
      | refactor  |

  Scenario: A scenario that still fails does not return the feature
    Given a started feature "FR-FAREWELL-01" at step "tdd_green"
    And a Red of "FR-FAREWELL-01" was verified at step "tdd_red"
    And the source file "src/farewell.ts" containing:
      """
      export function farewell(name: string): string {
        return `Goodbye, ${name}`;
      }
      """
    When I run "oid progress step FR-FAREWELL-01 bdd_red"
    And the step definitions file "features/steps/farewell.steps.ts" is changed to:
      """
      import { Then } from "@cucumber/cucumber";
      import assert from "node:assert/strict";

      Then("it says goodbye to Ann", async function () {
        const { farewell } = await import("../../src/farewell.js");
        assert.equal(farewell("Ann"), "See you, Ann");
      });
      """
    And I run "oid verify red features/farewell.feature:4"
    Then the command fails
    And the output starts with "red: not returned"
    And the output contains "the scenario does not pass"
    And the feature "FR-FAREWELL-01" has the cycle step "bdd_red"
    And no checkpoint is recorded

  Scenario: Source changed after going back does not return the feature
    Given a started feature "FR-FAREWELL-01" at step "tdd_green"
    And a Red of "FR-FAREWELL-01" was verified at step "tdd_red"
    And the source file "src/farewell.ts" containing:
      """
      export function farewell(name: string): string {
        return `Goodbye, ${name}`;
      }
      """
    When I run "oid progress step FR-FAREWELL-01 bdd_red"
    And the step definitions file "features/steps/farewell.steps.ts" is changed to:
      """
      import { Then } from "@cucumber/cucumber";
      import assert from "node:assert/strict";

      Then("it says goodbye to Ann", async function () {
        const { farewell } = await import("../../src/farewell.js");
        assert.equal(farewell("Ann"), "Goodbye, Ann!");
      });
      """
    And the source file "src/farewell.ts" is changed to:
      """
      export function farewell(name: string): string {
        return `Goodbye, ${name}!`;
      }
      """
    And I run "oid verify red features/farewell.feature:4"
    Then the command fails
    And the output starts with "red: not returned"
    And the output contains "src/farewell.ts changed since the return"
    And the feature "FR-FAREWELL-01" has the cycle step "bdd_red"
    And no checkpoint is recorded

  Scenario: A scenario that passes without this cycle's code does not return the feature, and the code is restored
    Given a started feature "FR-FAREWELL-01" at step "tdd_green"
    And a Red of "FR-FAREWELL-01" was verified at step "tdd_red"
    And the source file "src/farewell.ts" containing:
      """
      export function farewell(name: string): string {
        return `Goodbye, ${name}`;
      }
      """
    When I run "oid progress step FR-FAREWELL-01 bdd_red"
    And the step definitions file "features/steps/farewell.steps.ts" is changed to:
      """
      import { Then } from "@cucumber/cucumber";
      import assert from "node:assert/strict";

      Then("it says goodbye to Ann", async function () {
        const { greeting } = await import("../../src/greeting.js");
        assert.equal(greeting, "Hello");
      });
      """
    And I run "oid verify red features/farewell.feature:4"
    Then the command fails
    And the output starts with "red: not returned"
    And the output contains "the scenario passes without this cycle's code"
    And the feature "FR-FAREWELL-01" has the cycle step "bdd_red"
    And no checkpoint is recorded
    And the file "src/farewell.ts" contains:
      """
      export function farewell(name: string): string {
        return `Goodbye, ${name}`;
      }
      """

  Scenario: Integrity after going back allows step changes and refuses source changes
    Given a started feature "FR-FAREWELL-01" at step "refactor"
    And a Red of "FR-FAREWELL-01" was verified at step "tdd_red"
    And the source file "src/farewell.ts" containing:
      """
      export function farewell(name: string): string {
        return `Goodbye, ${name}`;
      }
      """
    When I run "oid progress step FR-FAREWELL-01 bdd_red"
    And the step definitions file "features/steps/farewell.steps.ts" is changed to:
      """
      import { Then } from "@cucumber/cucumber";
      import assert from "node:assert/strict";

      Then("it says goodbye to Ann", async function () {
        const { farewell } = await import("../../src/farewell.js");
        assert.equal(farewell("Ann"), "Goodbye, Ann");
      });
      """
    And I run "oid verify integrity"
    Then the command succeeds
    And the output starts with "integrity: ok"
    When the source file "src/farewell.ts" is changed to:
      """
      export function farewell(name: string): string {
        return `Bye, ${name}`;
      }
      """
    And I run "oid verify integrity"
    Then the command fails
    And the output contains "src/farewell.ts"

  Scenario: Going back from a Red with no code yet moves to the unit test whether the scenario fails as a Red
    Given a started feature "FR-FAREWELL-01" at step "tdd_red"
    And a Red of "FR-FAREWELL-01" was verified at step "bdd_red"
    When I run "oid progress step FR-FAREWELL-01 bdd_red"
    And the step definitions file "features/steps/farewell.steps.ts" is changed to:
      """
      import { Then } from "@cucumber/cucumber";
      import assert from "node:assert/strict";

      Then("it says goodbye to Ann", async function () {
        const { farewell } = await import("../../src/farewell.js");
        assert.equal(farewell("Ann"), "Goodbye, Ann");
      });
      """
    And I run "oid verify red features/farewell.feature:4"
    Then the command succeeds
    And the output starts with "red: valid (missing_implementation)"
    And the feature "FR-FAREWELL-01" has the cycle step "tdd_red"
    And the checkpoint records the step "bdd_red"

  Scenario: Going back from a Red with no code yet moves to the unit test also when the scenario already passes
    Given the source file "src/farewell.ts" containing:
      """
      export function farewell(name: string): string {
        return `Goodbye, ${name}`;
      }
      """
    And the changes are committed
    And a started feature "FR-FAREWELL-01" at step "tdd_red"
    And a Red of "FR-FAREWELL-01" was verified at step "bdd_red"
    When I run "oid progress step FR-FAREWELL-01 bdd_red"
    And the step definitions file "features/steps/farewell.steps.ts" is changed to:
      """
      import { Then } from "@cucumber/cucumber";
      import assert from "node:assert/strict";

      Then("it says goodbye to Ann", async function () {
        const { farewell } = await import("../../src/farewell.js");
        assert.equal(farewell("Ann"), "Goodbye, Ann");
      });
      """
    And I run "oid verify red features/farewell.feature:4"
    Then the command succeeds
    And the output starts with "red: moved to tdd_red"
    And the output contains "the scenario already passes"
    And the feature "FR-FAREWELL-01" has the cycle step "tdd_red"
    And the checkpoint records the step "bdd_red"

  Scenario: There is no manual move from bdd_red to tdd_green or refactor
    Given a started feature "FR-FAREWELL-01" at step "tdd_green"
    When I run "oid progress step FR-FAREWELL-01 bdd_red"
    And I run "oid progress step FR-FAREWELL-01 tdd_green"
    Then the command fails
    And the error output contains "cannot move FR-FAREWELL-01 from bdd_red to tdd_green"
    When I run "oid progress step FR-FAREWELL-01 refactor"
    Then the command fails
    And the error output contains "cannot move FR-FAREWELL-01 from bdd_red to refactor"
    When I run "oid progress step FR-FAREWELL-01 bdd_red"
    Then the command fails
    And the feature "FR-FAREWELL-01" has the cycle step "bdd_red"

  Scenario: Without a return, a scenario that passes with the evidence of an earlier green moves the feature to tdd_red
    Given the source file "src/farewell.ts" containing:
      """
      export function farewell(name: string): string {
        return `Goodbye, ${name}`;
      }
      """
    And a started feature "FR-FAREWELL-01" at step "bdd_red"
    And the started feature "FR-FAREWELL-01" also has a scenario "Say goodbye to Ann" marked "pass"
    And a later green ran the scenario "Say goodbye to Ann" of "FR-FAREWELL-01"
    When I run "oid verify red features/farewell.feature:4"
    Then the command succeeds
    And the output starts with "red: moved to tdd_red"
    And the output contains "an earlier green"
    And the feature "FR-FAREWELL-01" has the cycle step "tdd_red"
    And the checkpoint records the step "bdd_red"
