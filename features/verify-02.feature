@FR-VERIFY-02
Feature: Verify a BDD Red

  Background:
    Given a TypeScript project with BDD scenarios
    And the source file "src/greeting.ts" containing:
      """
      export function greet(name: string): string {
        return `Hello, ${name}`;
      }

      export const greeting = "Hello";
      """
    And the project is a git repository with its files committed

  Scenario: A scenario that passes without new code is not a Red
    Given the feature file "features/greeting.feature" containing:
      """
      Feature: Greeting

        Scenario: Greet by name
          Given the greeting
          Then it greets Ann
      """
    And the step definitions file "features/steps/greeting.steps.ts" containing:
      """
      import { Given, Then } from "@cucumber/cucumber";
      import assert from "node:assert/strict";

      Given("the greeting", function () {});

      Then("it greets Ann", async function () {
        const { greet } = await import("../../src/greeting.js");
        assert.equal(greet("Ann"), "Hello, Ann");
      });
      """
    When I run "oid verify red features/greeting.feature:3"
    Then the command fails
    And the output starts with "red: not valid (test_bug)"
    And the output contains "passes without new implementation"
    And no checkpoint is recorded

  Scenario: A scenario with an undefined step is not a Red
    Given the feature file "features/greeting.feature" containing:
      """
      Feature: Greeting

        Scenario: Shout a greeting
          Given the greeting
          Then it shouts Ann
      """
    And the step definitions file "features/steps/greeting.steps.ts" containing:
      """
      import { Given } from "@cucumber/cucumber";

      Given("the greeting", function () {});
      """
    When I run "oid verify red features/greeting.feature:3"
    Then the command fails
    And the output starts with "red: not valid (test_bug)"
    And the output contains "UNDEFINED"
    And no checkpoint is recorded

  Scenario: A scenario with a pending step is not a Red
    Given the feature file "features/greeting.feature" containing:
      """
      Feature: Greeting

        Scenario: Shout a greeting
          Given the greeting
          Then it shouts Ann
      """
    And the step definitions file "features/steps/greeting.steps.ts" containing:
      """
      import { Given, Then } from "@cucumber/cucumber";

      Given("the greeting", function () {});

      Then("it shouts Ann", function () {
        return "pending";
      });
      """
    When I run "oid verify red features/greeting.feature:3"
    Then the command fails
    And the output starts with "red: not valid (test_bug)"
    And the output contains "PENDING"
    And no checkpoint is recorded

  Scenario: A step that imports a module that does not exist yet is a valid Red
    Given the feature file "features/shout.feature" containing:
      """
      Feature: Shout

        Scenario: Shout a greeting
          Given the greeting
          Then it shouts Ann
      """
    And the step definitions file "features/steps/shout.steps.ts" containing:
      """
      import { Given, Then } from "@cucumber/cucumber";
      import assert from "node:assert/strict";

      Given("the greeting", function () {});

      Then("it shouts Ann", async function () {
        const { shout } = await import("../../src/shout.js");
        assert.equal(shout("Ann"), "HELLO, ANN");
      });
      """
    When I run "oid verify red features/shout.feature:3"
    Then the command succeeds
    And the output starts with "red: valid (missing_implementation)"
    And the checkpoint records the step "bdd_red"
    And the checkpoint lists the file "features/steps/shout.steps.ts"

  Scenario: A step that calls a function that does not exist yet is a valid Red
    Given the feature file "features/shout.feature" containing:
      """
      Feature: Shout

        Scenario: Shout a greeting
          Given the greeting
          Then it shouts Ann
      """
    And the step definitions file "features/steps/shout.steps.ts" containing:
      """
      import { Given, Then } from "@cucumber/cucumber";
      import assert from "node:assert/strict";

      Given("the greeting", function () {});

      Then("it shouts Ann", async function () {
        const { shout } = await import("../../src/greeting.js");
        assert.equal(shout("Ann"), "HELLO, ANN");
      });
      """
    When I run "oid verify red features/shout.feature:3"
    Then the command succeeds
    And the output starts with "red: valid (missing_implementation)"
    And the checkpoint records the step "bdd_red"

  Scenario: A step that imports a package that is not installed is not a Red
    Given the feature file "features/pad.feature" containing:
      """
      Feature: Pad

        Scenario: Pad a greeting
          Given the greeting
          Then it pads Ann
      """
    And the step definitions file "features/steps/pad.steps.ts" containing:
      """
      import { Given, Then } from "@cucumber/cucumber";

      Given("the greeting", function () {});

      Then("it pads Ann", async function () {
        const { pad } = await import("left-padz");
        pad("Ann", 5);
      });
      """
    When I run "oid verify red features/pad.feature:3"
    Then the command fails
    And the output starts with "red: not valid (environment)"
    And no checkpoint is recorded

  Scenario: A call to something that exists but is not a function needs a decision
    Given the feature file "features/greeting.feature" containing:
      """
      Feature: Greeting

        Scenario: Greet by calling the greeting
          Given the greeting
          Then it greets Ann
      """
    And the step definitions file "features/steps/greeting.steps.ts" containing:
      """
      import { Given, Then } from "@cucumber/cucumber";

      Given("the greeting", function () {});

      Then("it greets Ann", async function () {
        const { greeting } = await import("../../src/greeting.js");
        (greeting as unknown as (name: string) => string)("Ann");
      });
      """
    When I run "oid verify red features/greeting.feature:3"
    Then the command needs a decision
    And the output starts with "red: needs a decision"
    And the output contains "is not a function"
    And the output contains "--decide"
    And no checkpoint is recorded

  Scenario: A failing assertion needs a decision
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
    Then the command needs a decision
    And the output starts with "red: needs a decision"
    And the output contains "Hi, Ann"
    And the output contains "features/greeting.feature:3"
    And the output contains "business_assertion"
    And no checkpoint is recorded

  Scenario: A decision that the failure is a business assertion makes it a valid Red
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
    And I run "oid verify red features/greeting.feature:3 --decide business_assertion"
    Then the command succeeds
    And the output starts with "red: valid (business_assertion)"
    And the checkpoint records the step "bdd_red"
    And the checkpoint records an external decision

  Scenario: A decision that the failure is a test bug is not a Red
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
    And I run "oid verify red features/greeting.feature:3 --decide test_bug"
    Then the command fails
    And the output starts with "red: not valid (test_bug)"
    And no checkpoint is recorded

  Scenario: A decision is refused when the run does not need one
    Given the feature file "features/shout.feature" containing:
      """
      Feature: Shout

        Scenario: Shout a greeting
          Given the greeting
          Then it shouts Ann
      """
    And the step definitions file "features/steps/shout.steps.ts" containing:
      """
      import { Given, Then } from "@cucumber/cucumber";
      import assert from "node:assert/strict";

      Given("the greeting", function () {});

      Then("it shouts Ann", async function () {
        const { shout } = await import("../../src/shout.js");
        assert.equal(shout("Ann"), "HELLO, ANN");
      });
      """
    When I run "oid verify red features/shout.feature:3 --decide business_assertion"
    Then the command fails
    And the error output contains "no recorded run of this target needs a decision"
    And no checkpoint is recorded

  Scenario: Only the scenario at the given line runs
    Given the feature file "features/greeting.feature" containing:
      """
      Feature: Greeting

        Scenario: Undefined greeting
          Given the greeting
          Then it is not defined anywhere

        Scenario: Shout a greeting
          Given the greeting
          Then it shouts Ann
      """
    And the step definitions file "features/steps/greeting.steps.ts" containing:
      """
      import { Given, Then } from "@cucumber/cucumber";
      import assert from "node:assert/strict";

      Given("the greeting", function () {});

      Then("it shouts Ann", async function () {
        const { shout } = await import("../../src/shout.js");
        assert.equal(shout("Ann"), "HELLO, ANN");
      });
      """
    When I run "oid verify red features/greeting.feature:7"
    Then the command succeeds
    And the output starts with "red: valid (missing_implementation)"

  Scenario: A line where no scenario starts is not a Red
    Given the feature file "features/greeting.feature" containing:
      """
      Feature: Greeting

        Scenario: Greet by name
          Given the greeting
          Then it greets Ann
      """
    And the step definitions file "features/steps/greeting.steps.ts" containing:
      """
      import { Given } from "@cucumber/cucumber";

      Given("the greeting", function () {});
      """
    When I run "oid verify red features/greeting.feature:1"
    Then the command fails
    And the output starts with "red: not valid (test_bug)"
    And the output contains "no scenario"
    And no checkpoint is recorded

  Scenario: A step file changed since the last commit that stops cucumber from starting is not a Red
    Given the feature file "features/greeting.feature" containing:
      """
      Feature: Greeting

        Scenario: Greet by name
          Given the greeting
          Then it greets Ann
      """
    And the step definitions file "features/steps/greeting.steps.ts" containing:
      """
      import { Given } from "@cucumber/cucumber";

      const = ;
      Given("the greeting", function () {});
      """
    When I run "oid verify red features/greeting.feature:3"
    Then the command fails
    And the output starts with "red: not valid (test_bug)"
    And the output contains "features/steps/greeting.steps.ts"
    And no checkpoint is recorded

  Scenario: A step file unchanged since the last commit that stops cucumber from starting is an environment problem
    Given the feature file "features/greeting.feature" containing:
      """
      Feature: Greeting

        Scenario: Greet by name
          Given the greeting
          Then it greets Ann
      """
    And the step definitions file "features/steps/greeting.steps.ts" containing:
      """
      import { Given } from "@cucumber/cucumber";

      const = ;
      Given("the greeting", function () {});
      """
    And the project is a git repository with its files committed
    When I run "oid verify red features/greeting.feature:3"
    Then the command fails
    And the output starts with "red: not valid (environment)"
    And no checkpoint is recorded
