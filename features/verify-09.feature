@FR-VERIFY-09
Feature: Try a change without recording it

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

      it("greets by name", () => {
        expect(greet("Ann")).toBe("Hello, Ann");
      });

      it("greets in capitals", () => {
        expect(greet("Ann")).toBe("HELLO, ANN");
      });
      """
    And the step definitions file "features/steps/greeting.steps.ts" containing:
      """
      import { Given, Then } from "@cucumber/cucumber";
      import assert from "node:assert/strict";
      import { greet } from "../../src/greeting.js";

      Given("the greeting for Ann", function () {});

      Then("it is polite", function () {
        assert.equal(greet("Ann"), "Hello, Ann");
      });

      Then("it is shouted", function () {
        assert.equal(greet("Ann"), "HELLO, ANN");
      });
      """
    And the feature file "features/greeting.feature" containing:
      """
      @FR-GREETING-01
      Feature: Greeting

        Scenario: Greet Ann politely
          Given the greeting for Ann
          Then it is polite

        Scenario: Greet Ann loudly
          Given the greeting for Ann
          Then it is shouted

        Scenario: Greet Ann in writing
          Given the greeting for Ann
          When it is printed
          Then it is polite
      """
    And the project is a git repository with its files committed

  Scenario: A unit test that passes gives a short verdict, one line for each check
    When I run "oid try \"tests/unit/greeting.test.ts > greets by name\""
    Then the command succeeds
    And the output contains "test: passed"
    And the output contains "types: ok"
    And the output contains "lint: skipped (commands.lint is null)"
    And the output contains "try: ok"

  Scenario: A unit test that fails shows its failure message without the stack
    When I run "oid try \"tests/unit/greeting.test.ts > greets in capitals\""
    Then the command fails
    And the output contains "test: failed"
    And the output contains "expected 'Hello, Ann' to be 'HELLO, ANN'"
    And the output does not contain "    at "
    And the output contains "types: ok"
    And the output contains "try: failed"

  Scenario: A scenario that passes is tried by its location, and by its name
    When I run "oid try features/greeting.feature:4"
    Then the command succeeds
    And the output contains "test: passed"
    When I run "oid try \"Greet Ann politely\""
    Then the command succeeds
    And the output contains "test: passed"

  Scenario: A scenario that fails names the step and shows why
    When I run "oid try features/greeting.feature:8"
    Then the command fails
    And the output contains "test: failed at features/greeting.feature:10 Then it is shouted"
    And the output contains "'HELLO, ANN'"
    And the output contains "try: failed"

  Scenario: A scenario with a step that has no definition lists it with its location and text
    When I run "oid try features/greeting.feature:12"
    Then the command fails
    And the output contains "test: undefined steps (1)"
    And the output contains "features/greeting.feature:14 When it is printed"
    And the output contains "try: failed"

  Scenario: A dry run lists the undefined steps and runs no test, no type check and no linter
    When I run "oid try features/greeting.feature:12 --dry-run"
    Then the command fails
    And the output contains "dry-run: undefined steps (1)"
    And the output contains "features/greeting.feature:14 When it is printed"
    And the output does not contain "types:"
    And the output does not contain "lint:"

  Scenario: A dry run of a scenario whose steps are all defined passes, though a step would fail
    When I run "oid try features/greeting.feature:8 --dry-run"
    Then the command succeeds
    And the output contains "dry-run: ok (no undefined step)"
    And the output does not contain "test:"

  Scenario: A type error is reported with its file and line, though the test passes
    Given the source file "src/greeting.ts" is changed to:
      """
      export function greet(name: string): string {
        return `Hello, ${name}`;
      }

      export const answer: number = "forty-two";
      """
    When I run "oid try \"tests/unit/greeting.test.ts > greets by name\""
    Then the command fails
    And the output contains "test: passed"
    And the output contains "types: failed (1 error)"
    And the output contains "src/greeting.ts:5 TS2322"
    And the output contains "try: failed"

  Scenario: The linter runs only on the files changed since the last checkpoint, tracked or not, never the ignored ones
    Given the lint command of the project reports a problem in every file it is given
    And the project ignores the file "src/generated.ts"
    And the source file "src/greeting.ts" is changed to:
      """
      export function greet(name: string): string {
        return `Hello, ${name}!`;
      }
      """
    And the source file "src/farewell.ts" containing:
      """
      export const farewell = "Goodbye";
      """
    And the source file "src/generated.ts" containing:
      """
      export const generated = true;
      """
    And the project has an untracked file "notes.md"
    When I run "oid try \"tests/unit/greeting.test.ts > greets by name\""
    Then the command fails
    And the output contains "lint: failed (2 files)"
    And the output contains "problem in src/greeting.ts"
    And the output contains "problem in src/farewell.ts"
    And the output does not contain "src/generated.ts"
    And the output does not contain "notes.md"
    And the output does not contain "tests/unit/greeting.test.ts"

  Scenario: With no file changed since the last checkpoint, the linter is skipped and says so
    Given the lint command of the project reports a problem in every file it is given
    When I run "oid try \"tests/unit/greeting.test.ts > greets by name\""
    Then the command succeeds
    And the output contains "lint: skipped (no file changed since the last checkpoint)"

  Scenario: A command that does not end is stopped at the limit and the verdict says so
    Given the unit command of the project never ends
    And the limit "limits.command_timeout_s" of the project is 1
    When I run "oid try \"tests/unit/greeting.test.ts > greets by name\""
    Then the command fails
    And the output contains "limits.command_timeout_s"
    And the output contains "1 s"

  Scenario: Trying records nothing, and needs no feature in focus
    Given the files of the project are noted
    When I run "oid try features/greeting.feature:8"
    And I run "oid try \"tests/unit/greeting.test.ts > greets in capitals\""
    Then the project has no ".outside-in" directory
    And no file of the project was created, changed or removed

  Scenario: Trying leaves the checkpoint, the focus and the progress of a feature in the middle of its cycle as they were
    Given a started feature "FR-GREETING-01" at step "bdd_red"
    And the focus is on "FR-GREETING-01"
    And a Red of "FR-GREETING-01" was verified at step "bdd_red"
    And the files of the project are noted
    When I run "oid try features/greeting.feature:8"
    And I run "oid try features/greeting.feature:12 --dry-run"
    And I run "oid try \"tests/unit/greeting.test.ts > greets in capitals\""
    Then no file of the project was created, changed or removed

  Scenario: A test name that matches no test is a failed verdict
    When I run "oid try \"tests/unit/greeting.test.ts > greets nobody\""
    Then the command fails
    And the output contains "test: failed"
    And the output contains "greets nobody"

  Scenario: A missing target, and a dry run of a unit test, are usage errors
    When I run "oid try"
    Then the command fails
    And the error output contains "missing test or scenario"
    When I run "oid try \"tests/unit/greeting.test.ts > greets by name\" --dry-run"
    Then the command fails
    And the error output contains "--dry-run"

  Scenario: oid try --help shows its usage and its options
    When I run "oid try --help"
    Then the command succeeds
    And the output contains "usage: oid try"
    And the output contains "--dry-run"
    And the output contains "Exit codes"
    And the error output is empty
