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
