@FR-VERIFY-03
Feature: Every kind of static import of something missing stops cucumber

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

  Scenario: A default import of a module that does not exist yet is not a Red
    Given the step definitions file "features/steps/shout.steps.ts" containing:
      """
      import { Given, Then } from "@cucumber/cucumber";
      import shout from "../../src/shout.js";

      Given("the greeting", function () {});

      Then("it shouts Ann", function () {
        shout("Ann");
      });
      """
    When I run "oid verify red features/shout.feature:3"
    Then the command fails
    And the output starts with "red: not valid (test_bug)"
    And the output contains "features/steps/shout.steps.ts:2 imports default from \"../../src/shout.js\", which does not exist yet"
    And no checkpoint is recorded

  Scenario: A default import of a module with no default export is not a Red
    Given the step definitions file "features/steps/shout.steps.ts" containing:
      """
      import { Given, Then } from "@cucumber/cucumber";
      import greeting from "../../src/greeting.js";

      Given("the greeting", function () {});

      Then("it shouts Ann", function () {
        greeting("Ann");
      });
      """
    When I run "oid verify red features/shout.feature:3"
    Then the command fails
    And the output starts with "red: not valid (test_bug)"
    And the output contains "features/steps/shout.steps.ts:2 imports default from \"../../src/greeting.js\", which does not exist yet"
    And no checkpoint is recorded
