@FR-VERIFY-08
Feature: Fix a unit test after the code exists

  Background:
    Given a TypeScript project with unit tests
    And the source file "src/greeting.ts" containing:
      """
      export const greeting = "Hello";
      """
    And the unit test file "tests/unit/farewell.test.ts" containing:
      """
      import { describe, expect, it } from "vitest";
      import { farewell } from "../../src/farewell.js";

      describe("farewell", () => {
        it("says goodbye to Ann", () => {
          expect(farewell("Ann")).toContain("Ann");
        });
      });
      """
    And the project is a git repository with its files committed
    And the focus is on "FR-FAREWELL-01"

  Scenario Outline: A unit test fixed after the code exists returns the feature to where it came from
    Given a started feature "FR-FAREWELL-01" at step "<came from>"
    And a Red of "FR-FAREWELL-01" was verified at step "tdd_red"
    And the source file "src/farewell.ts" containing:
      """
      export function farewell(name: string): string {
        return `Goodbye, ${name}`;
      }
      """
    When I run "oid progress step FR-FAREWELL-01 tdd_red"
    And the unit test file "tests/unit/farewell.test.ts" is changed to:
      """
      import { describe, expect, it } from "vitest";
      import { farewell } from "../../src/farewell.js";

      describe("farewell", () => {
        it("says goodbye to Ann", () => {
          expect(farewell("Ann")).toBe("Goodbye, Ann");
        });
      });
      """
    And I run "oid verify red \"tests/unit/farewell.test.ts > says goodbye to Ann\""
    Then the command succeeds
    And the output starts with "red: returned to <came from>"
    And the output contains "src/farewell.ts"
    And the feature "FR-FAREWELL-01" has the cycle step "<came from>"
    And the checkpoint records the step "tdd_red"
    And the file "src/farewell.ts" contains:
      """
      export function farewell(name: string): string {
        return `Goodbye, ${name}`;
      }
      """

    Examples:
      | came from    |
      | tdd_green    |
      | refactor     |
      | quality_gate |

  Scenario: A test that fails after going back is judged as any Red and the feature stays at tdd_red
    Given a started feature "FR-FAREWELL-01" at step "tdd_green"
    And a Red of "FR-FAREWELL-01" was verified at step "tdd_red"
    And the source file "src/farewell.ts" containing:
      """
      export function farewell(name: string): string {
        return `Goodbye, ${name}`;
      }
      """
    When I run "oid progress step FR-FAREWELL-01 tdd_red"
    And the unit test file "tests/unit/farewell.test.ts" is changed to:
      """
      import { describe, expect, it } from "vitest";
      import { farewell } from "../../src/farewell.js";

      describe("farewell", () => {
        it("says goodbye to Bob", () => {
          expect(farewell("Bob")).toBe("See you, Bob");
        });
      });
      """
    And I run "oid verify red \"tests/unit/farewell.test.ts > says goodbye to Bob\""
    Then the command succeeds
    And the output starts with "red: valid (business_assertion)"
    And the feature "FR-FAREWELL-01" has the cycle step "tdd_red"
    And the checkpoint records the step "tdd_red"

  Scenario: Source changed after going back does not return the feature
    Given a started feature "FR-FAREWELL-01" at step "tdd_green"
    And a Red of "FR-FAREWELL-01" was verified at step "tdd_red"
    And the source file "src/farewell.ts" containing:
      """
      export function farewell(name: string): string {
        return `Goodbye, ${name}`;
      }
      """
    When I run "oid progress step FR-FAREWELL-01 tdd_red"
    And the unit test file "tests/unit/farewell.test.ts" is changed to:
      """
      import { describe, expect, it } from "vitest";
      import { farewell } from "../../src/farewell.js";

      describe("farewell", () => {
        it("says goodbye to Ann", () => {
          expect(farewell("Ann")).toBe("Goodbye, Ann!");
        });
      });
      """
    And the source file "src/farewell.ts" is changed to:
      """
      export function farewell(name: string): string {
        return `Goodbye, ${name}!`;
      }
      """
    And I run "oid verify red \"tests/unit/farewell.test.ts > says goodbye to Ann\""
    Then the command fails
    And the output starts with "red: not returned"
    And the output contains "src/farewell.ts changed since the return"
    And the feature "FR-FAREWELL-01" has the cycle step "tdd_red"
    And no checkpoint is recorded

  Scenario: A test that passes without this cycle's code does not return the feature, and the code is restored
    Given a started feature "FR-FAREWELL-01" at step "tdd_green"
    And a Red of "FR-FAREWELL-01" was verified at step "tdd_red"
    And the source file "src/farewell.ts" containing:
      """
      export function farewell(name: string): string {
        return `Goodbye, ${name}`;
      }
      """
    When I run "oid progress step FR-FAREWELL-01 tdd_red"
    And the unit test file "tests/unit/farewell.test.ts" is changed to:
      """
      import { describe, expect, it } from "vitest";
      import { greeting } from "../../src/greeting.js";

      describe("farewell", () => {
        it("says goodbye to Ann", () => {
          expect(greeting).toBe("Hello");
        });
      });
      """
    And I run "oid verify red \"tests/unit/farewell.test.ts > says goodbye to Ann\""
    Then the command fails
    And the output starts with "red: not returned"
    And the output contains "the test passes without this cycle's code"
    And the feature "FR-FAREWELL-01" has the cycle step "tdd_red"
    And no checkpoint is recorded
    And the file "src/farewell.ts" contains:
      """
      export function farewell(name: string): string {
        return `Goodbye, ${name}`;
      }
      """

  Scenario: Integrity after going back allows test changes and refuses source changes
    Given a started feature "FR-FAREWELL-01" at step "refactor"
    And a Red of "FR-FAREWELL-01" was verified at step "tdd_red"
    And the source file "src/farewell.ts" containing:
      """
      export function farewell(name: string): string {
        return `Goodbye, ${name}`;
      }
      """
    When I run "oid progress step FR-FAREWELL-01 tdd_red"
    And the unit test file "tests/unit/farewell.test.ts" is changed to:
      """
      import { describe, expect, it } from "vitest";
      import { farewell } from "../../src/farewell.js";

      describe("farewell", () => {
        it("says goodbye to Ann", () => {
          expect(farewell("Ann")).toBe("Goodbye, Ann");
        });
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

  Scenario: A test that passes with no code in this cycle is still not a Red
    Given the source file "src/farewell.ts" containing:
      """
      export function farewell(name: string): string {
        return `Goodbye, ${name}`;
      }
      """
    And a started feature "FR-FAREWELL-01" at step "quality_gate"
    And a Red of "FR-FAREWELL-01" was verified at step "tdd_red"
    When I run "oid progress step FR-FAREWELL-01 tdd_red"
    And the unit test file "tests/unit/farewell.test.ts" is changed to:
      """
      import { describe, expect, it } from "vitest";
      import { farewell } from "../../src/farewell.js";

      describe("farewell", () => {
        it("says goodbye to Ann", () => {
          expect(farewell("Ann")).toBe("Goodbye, Ann");
        });
      });
      """
    And I run "oid verify red \"tests/unit/farewell.test.ts > says goodbye to Ann\""
    Then the command fails
    And the output starts with "red: not valid (test_bug)"
    And the feature "FR-FAREWELL-01" has the cycle step "tdd_red"
    And no checkpoint is recorded
