@FR-PROG-04
Feature: Advance the cycle step

  Scenario: A pending feature is started with select
    Given a tracked feature "FR-X-01" titled "Alpha"
    When I run "oid progress step FR-X-01 select"
    Then the command succeeds
    And the feature "FR-X-01" has the status "in_progress"
    And the feature "FR-X-01" has the cycle step "select"

  Scenario Outline: The cycle moves forward through its steps
    Given a started feature "FR-X-01" at step "<from>"
    When I run "oid progress step FR-X-01 <to>"
    Then the command succeeds
    And the feature "FR-X-01" has the cycle step "<to>"

    Examples:
      | from      | to            |
      | select    | bdd_red       |
      | bdd_red   | tdd_red       |
      | tdd_red   | tdd_green     |
      | tdd_red   | bdd_red       |
      | tdd_green | refactor      |
      | tdd_green | tdd_red       |
      | tdd_green | bdd_red       |
      | tdd_green | quality_gate  |
      | refactor  | tdd_red       |
      | refactor  | bdd_red       |
      | refactor  | quality_gate  |

  Scenario Outline: A step that the cycle does not allow is rejected
    Given a started feature "FR-X-01" at step "<from>"
    When I run "oid progress step FR-X-01 <to>"
    Then the command fails
    And the error output contains "<from>"
    And the error output contains "<to>"
    And the progress file is unchanged

    Examples:
      | from         | to           |
      | select       | tdd_green    |
      | select       | quality_gate |
      | bdd_red      | refactor     |
      | refactor     | tdd_green    |
      | quality_gate | select       |
      | tdd_red      | tdd_red      |

  Scenario: An unknown step name is rejected
    Given a started feature "FR-X-01" at step "select"
    When I run "oid progress step FR-X-01 sleeping"
    Then the command fails
    And the error output contains "sleeping"
    And the progress file is unchanged

  Scenario: A pending feature can only start with select
    Given a tracked feature "FR-X-01" titled "Alpha"
    When I run "oid progress step FR-X-01 bdd_red"
    Then the command fails
    And the error output contains "bdd_red"
    And the progress file is unchanged

  Scenario: A feature that is done cannot change step
    Given a completed feature "FR-X-01"
    When I run "oid progress step FR-X-01 select"
    Then the command fails
    And the error output contains "FR-X-01"
    And the progress file is unchanged

  Scenario: A feature that is not tracked is rejected
    Given a tracked feature "FR-X-01" titled "Alpha"
    When I run "oid progress step FR-X-99 select"
    Then the command fails
    And the error output contains "FR-X-99"
    And the progress file is unchanged

  Scenario: The variable OID_OVERRIDE does not let a feature with no revise record leave bdd_red for the quality gate
    Given a started feature "FR-GREETING-01" at step "bdd_red"
    When I run "oid progress step FR-GREETING-01 quality_gate" with "OID_OVERRIDE" set to "the new scenarios cover code that exists"
    Then the command fails
    And the error output contains "revise"
    And the feature "FR-GREETING-01" has the cycle step "bdd_red"
    And the output does not contain "the new scenarios cover code that exists"
    And the error output does not contain "the new scenarios cover code that exists"

  Scenario: A scenario added after a return from the quality gate passes at once and is proved with a mutant
    Given a TypeScript project with BDD scenarios
    And the source file "src/greeting.ts" containing:
      """
      export function greet(name: string): string {
        return `Hello, ${name}`;
      }
      """
    And the step definitions file "features/steps/greeting.steps.ts" containing:
      """
      import { Given, Then } from "@cucumber/cucumber";
      import assert from "node:assert/strict";
      import { greet } from "../../src/greeting.js";

      Given("the greeting for Ann", function () {});

      Then("it is polite", function () {
        assert.ok(greet("Ann").includes("Ann"));
      });

      Then("it says hello to Ann", function () {
        assert.equal(greet("Ann"), "Hello, Ann");
      });
      """
    And the feature file "features/greeting.feature" containing:
      """
      @FR-GREETING-01
      Feature: Greeting

        Scenario: Greet Ann politely
          Given the greeting for Ann
          Then it is polite
      """
    And the project is a git repository with its files committed
    And a started feature "FR-GREETING-01" at step "quality_gate" with a scenario "Greet Ann politely" marked "pass"
    And the focus is on "FR-GREETING-01"
    And the mutant file "mutants/goodbye.diff" containing:
      """
      --- a/src/greeting.ts
      +++ b/src/greeting.ts
      @@ -1,3 +1,3 @@
       export function greet(name: string): string {
      -  return `Hello, ${name}`;
      +  return `Goodbye, ${name}`;
       }
      """
    When I run "oid progress step FR-GREETING-01 bdd_red"
    And the feature file "features/greeting.feature" is changed to:
      """
      @FR-GREETING-01
      Feature: Greeting

        Scenario: Greet Ann politely
          Given the greeting for Ann
          Then it is polite

        Scenario: Greet Ann warmly
          Given the greeting for Ann
          Then it says hello to Ann
      """
    And I run "oid verify red features/greeting.feature:8 --mutant mutants/goodbye.diff"
    Then the command succeeds
    And the output contains "fails with the mutant"
    And the feature "FR-GREETING-01" has the cycle step "quality_gate"
    And the scenario "Greet Ann warmly" of "FR-GREETING-01" records the mutant:
      """
      --- a/src/greeting.ts
      +++ b/src/greeting.ts
      @@ -1,3 +1,3 @@
       export function greet(name: string): string {
      -  return `Hello, ${name}`;
      +  return `Goodbye, ${name}`;
       }
      """
    And the file "src/greeting.ts" contains:
      """
      export function greet(name: string): string {
        return `Hello, ${name}`;
      }
      """
