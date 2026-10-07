@FR-VERIFY-01
Feature: A unit target whose file has no directory is resolved to the test file that ran, or refused

  Background:
    Given a TypeScript project with unit tests
    And the source file "src/greeting.ts" containing:
      """
      export const greeting = "Hello";
      """
    And the unit test file "tests/unit/greeting.test.ts" containing:
      """
      import { expect, it } from "vitest";
      import { greet } from "../../src/greeting.js";

      it("greets by name", () => {
        expect(greet("Ann")).toBe("Hello, Ann");
      });
      """
    And the unit test file "tests/unit/farewell.test.ts" containing:
      """
      import { expect, it } from "vitest";
      import { bye } from "../../src/greeting.js";

      it("says goodbye", () => {
        expect(bye("Ann")).toBe("Bye, Ann");
      });
      """
    And the unit test file "tests/unit/loud-farewell.test.ts" containing:
      """
      import { expect, it } from "vitest";
      import { bye } from "../../src/greeting.js";

      it("says goodbye", () => {
        expect(bye("Ann").toUpperCase()).toBe("BYE, ANN");
      });
      """
    And the project is a git repository with its files committed

  Scenario: A test file given without its directory is the file that ran
    When I run the built "oid verify red \"greeting.test.ts > greets by name\""
    Then the command succeeds
    And the output starts with "red: valid (missing_implementation)"
    And the command prints no stack trace
    And the checkpoint records the step "tdd_red"

  Scenario: A test file given without its directory that matches several files with that test is refused
    When I run the built "oid verify red \"farewell.test.ts > says goodbye\""
    Then the command fails
    And the error output contains "tests/unit/farewell.test.ts"
    And the error output contains "tests/unit/loud-farewell.test.ts"
    And the command prints no stack trace
    And no checkpoint is recorded

  Scenario: A test file that matches no file is refused
    When I run the built "oid verify red \"missing.test.ts > greets by name\""
    Then the command fails
    And the output contains "missing.test.ts"
    And the command prints no stack trace
    And no checkpoint is recorded
