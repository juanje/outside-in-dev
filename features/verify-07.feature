@FR-VERIFY-07
Feature: Stop a command that does not end

  Scenario: A green whose unit runner never ends stops it at the limit and leaves nothing running
    Given a TypeScript project with unit tests
    And the unit command of the project is a runner that never ends and starts a child process
    And the limit "limits.command_timeout_s" of the project is 1
    And the source file "src/greeting.ts" containing:
      """
      export const greeting = "Hello";
      """
    And the project is a git repository with its files committed
    And a started feature "FR-GREETING-01" at step "tdd_green"
    And the focus is on "FR-GREETING-01"
    When I run "oid verify green"
    Then the command fails
    And the error output contains "limits.command_timeout_s"
    And the error output contains "1 s"
    And the error output contains "hang-runner.mjs"
    And no process started by the runner is still alive
    And the project has no verify lock

  Scenario: A Red whose unit runner never ends is an environment failure
    Given a TypeScript project with unit tests
    And the unit command of the project is a runner that never ends and starts a child process
    And the limit "limits.command_timeout_s" of the project is 1
    And the unit test file "tests/unit/greeting.test.ts" containing:
      """
      import { expect, it } from "vitest";

      it("greets by name", () => {
        expect(1).toBe(1);
      });
      """
    And the project is a git repository with its files committed
    When I run "oid verify red \"tests/unit/greeting.test.ts > greets by name\""
    Then the command fails
    And the output starts with "red: not valid (environment)"
    And the output contains "limits.command_timeout_s"
    And the output contains "1 s"
    And no process started by the runner is still alive
    And the project has no verify lock
    And no checkpoint is recorded

  Scenario: A run whose suite never ends stops the runner, ends with the same message and releases its lock
    Given a git project with a green suite
    And the unit command of the project is a runner that never ends and starts a child process
    And the limit "limits.command_timeout_s" of the project is 1
    When I run "oid run"
    Then the event log of the run records an error mentioning "limits.command_timeout_s"
    And the event log of the run records an error mentioning "1 s"
    And no process started by the runner is still alive
    And the project has no lock

  Scenario: A unit run that passes its limit after the coding agent's change rejects the attempt and the next attempt goes on
    Given a git project with a green suite
    And the project runs its BDD scenarios with cucumber and defines the steps of the scenario "Add to cart"
    And SPEC.md has the requirements "FR-CART-01" and "FR-CART-02"
    And progress.json records "FR-CART-01" as done with its passing scenario "Add to cart", and "FR-CART-02" as pending
    And the feature-writing agent writes for "FR-CART-02" the scenarios "Add a line" and "Remove a line"
    And the step-writing agent writes the steps of each scenario it is given, and they fail because the cart code does not exist yet
    And the project allows 1 retry for each state
    And the test-writing agent writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
    And the unit runner does not end within the limit while it checks the coding agent's first attempt
    And the coding agent's second attempt writes the cart code that passes the unit test and the scenario
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "abort"
    Then the event log of the run records the "attempt_rejected" of "CODE_GREEN" with the attempt 1 before the "agent_start" of "CODE_GREEN" with the attempt 2
    And that reason has the evidence "Evidence:" naming "limits.command_timeout_s"

  Scenario: A command that passes its limit in the quality gate is a failed check put to the human
    Given a git project with a green suite
    And the project runs its BDD scenarios with cucumber and defines the steps of the scenario "Add to cart"
    And SPEC.md has the requirements "FR-CART-01" and "FR-CART-02"
    And progress.json records "FR-CART-01" as done with its passing scenario "Add to cart", and "FR-CART-02" as pending
    And the feature-writing agent writes for "FR-CART-02" the scenarios "Add a line" and "Remove a line"
    And the step-writing agent writes the steps of each scenario it is given, and they fail because the cart code does not exist yet
    And the agents write for each of the two scenarios a failing unit test and the cart code that passes it and the scenario
    And the detectors find nothing
    And the BDD runner does not end within the limit in the quality gate
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "abort"
    Then the human was asked once what to do about the quality gate, with the actions "view", "edit" and "abort"
    And the question about the quality gate mentions "limits.command_timeout_s"
