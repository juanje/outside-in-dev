@FR-VERIFY-03
Feature: Check that steps load

  Background:
    Given a TypeScript project with BDD scenarios
    And the source file "src/greeting.ts" containing:
      """
      export function greet(name: string): string {
        return `Hello, ${name}`;
      }
      """
    And the feature file "features/shout.feature" containing:
      """
      Feature: Shout

        Scenario: Shout a greeting
          Given the greeting
          Then it shouts Ann
      """
    And the project is a git repository with its files committed

  Scenario: A step file that statically imports a module that does not exist yet is not a Red
    Given the step definitions file "features/steps/shout.steps.ts" containing:
      """
      import { Given, Then } from "@cucumber/cucumber";
      import { shout } from "../../src/shout.js";

      Given("the greeting", function () {});

      Then("it shouts Ann", function () {
        shout("Ann");
      });
      """
    When I run "oid verify red features/shout.feature:3"
    Then the command fails
    And the output starts with "red: not valid (test_bug)"
    And the output contains "features/steps/shout.steps.ts:2 imports shout from \"../../src/shout.js\", which does not exist yet: import it dynamically inside the step"
    And no checkpoint is recorded

  Scenario: A step file that statically imports a name its module does not export yet is not a Red
    Given the step definitions file "features/steps/shout.steps.ts" containing:
      """
      import { Given, Then } from "@cucumber/cucumber";
      import { greet, shout } from "../../src/greeting.js";

      Given("the greeting", function () {});

      Then("it shouts Ann", function () {
        shout(greet("Ann"));
      });
      """
    When I run "oid verify red features/shout.feature:3"
    Then the command fails
    And the output starts with "red: not valid (test_bug)"
    And the output contains "features/steps/shout.steps.ts:2 imports shout from \"../../src/greeting.js\", which does not exist yet"
    And the output does not contain "imports greet"
    And no checkpoint is recorded
