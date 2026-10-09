@FR-VERIFY-01
Feature: Verify a unit Red

  Background:
    Given a TypeScript project with unit tests
    And the source file "src/greeting.ts" containing:
      """
      export function greet(name: string): string {
        return `Hello, ${name}`;
      }

      export const greeting = "Hello";
      """
    And the project is a git repository with its files committed

  Scenario: A test that passes without new code is not a Red
    Given the unit test file "tests/unit/greeting.test.ts" containing:
      """
      import { expect, it } from "vitest";
      import { greet } from "../../src/greeting.js";

      it("greets by name", () => {
        expect(greet("Ann")).toBe("Hello, Ann");
      });
      """
    When I run "oid verify red \"tests/unit/greeting.test.ts > greets by name\""
    Then the command fails
    And the output starts with "red: not valid (test_bug)"
    And the output contains "passes without new implementation"
    And no checkpoint is recorded

  Scenario: A test with a syntax error is not a Red
    Given the unit test file "tests/unit/greeting.test.ts" containing:
      """
      import { it } from "vitest";

      it("greets by name", () => {
        const = ;
      });
      """
    When I run "oid verify red \"tests/unit/greeting.test.ts > greets by name\""
    Then the command fails
    And the output starts with "red: not valid (test_bug)"
    And no checkpoint is recorded

  Scenario: A test of a module that does not exist yet is a valid Red
    Given the unit test file "tests/unit/shout.test.ts" containing:
      """
      import { expect, it } from "vitest";
      import { shout } from "../../src/shout.js";

      it("shouts a greeting", () => {
        expect(shout("Ann")).toBe("HELLO, ANN");
      });
      """
    When I run "oid verify red \"tests/unit/shout.test.ts > shouts a greeting\""
    Then the command succeeds
    And the output starts with "red: valid (missing_implementation)"
    And the checkpoint records the step "tdd_red"
    And the checkpoint lists the file "tests/unit/shout.test.ts"

  Scenario: A test of a function that does not exist yet is a valid Red
    Given the unit test file "tests/unit/greeting.test.ts" containing:
      """
      import { expect, it } from "vitest";
      import { shout } from "../../src/greeting.js";

      it("shouts a greeting", () => {
        expect(shout("Ann")).toBe("HELLO, ANN");
      });
      """
    When I run "oid verify red \"tests/unit/greeting.test.ts > shouts a greeting\""
    Then the command succeeds
    And the output starts with "red: valid (missing_implementation)"
    And the checkpoint records the step "tdd_red"

  Scenario: A test of a package that is not installed is not a Red
    Given the unit test file "tests/unit/pad.test.ts" containing:
      """
      import { expect, it } from "vitest";
      import { pad } from "left-padz";

      it("pads a greeting", () => {
        expect(pad("Ann", 5)).toBe("  Ann");
      });
      """
    When I run "oid verify red \"tests/unit/pad.test.ts > pads a greeting\""
    Then the command fails
    And the output starts with "red: not valid (environment)"
    And no checkpoint is recorded

  Scenario: A call to something that exists but is not a function needs a decision
    Given the unit test file "tests/unit/greeting.test.ts" containing:
      """
      import { expect, it } from "vitest";
      import { greeting } from "../../src/greeting.js";

      it("greets by calling the greeting", () => {
        expect((greeting as unknown as (name: string) => string)("Ann")).toBe("Hello, Ann");
      });
      """
    When I run "oid verify red \"tests/unit/greeting.test.ts > greets by calling the greeting\""
    Then the command needs a decision
    And the output starts with "red: needs a decision"
    And the output contains "is not a function"
    And the output contains "--decide"
    And no checkpoint is recorded

  Scenario: A failing assertion needs a decision
    Given the unit test file "tests/unit/greeting.test.ts" containing:
      """
      import { expect, it } from "vitest";
      import { greet } from "../../src/greeting.js";

      it("greets informally", () => {
        expect(greet("Ann")).toBe("Hi, Ann");
      });
      """
    And the changes are committed
    When I run "oid verify red \"tests/unit/greeting.test.ts > greets informally\""
    Then the command needs a decision
    And the output starts with "red: needs a decision"
    And the output contains "Hi, Ann"
    And the output contains "tests/unit/greeting.test.ts > greets informally"
    And the output contains "business_assertion"
    And no checkpoint is recorded

  Scenario: Any other runtime error needs a decision
    Given the unit test file "tests/unit/greeting.test.ts" containing:
      """
      import { expect, it } from "vitest";
      import { greet } from "../../src/greeting.js";

      it("greets with a negative repeat", () => {
        expect(greet("Ann".repeat(-1))).toBe("Hello, ");
      });
      """
    When I run "oid verify red \"tests/unit/greeting.test.ts > greets with a negative repeat\""
    Then the command needs a decision
    And the output starts with "red: needs a decision"
    And the output contains "RangeError"
    And no checkpoint is recorded

  Scenario: A decision that the failure is a business assertion makes it a valid Red
    Given the unit test file "tests/unit/greeting.test.ts" containing:
      """
      import { expect, it } from "vitest";
      import { greet } from "../../src/greeting.js";

      it("greets informally", () => {
        expect(greet("Ann")).toBe("Hi, Ann");
      });
      """
    And the changes are committed
    When I run "oid verify red \"tests/unit/greeting.test.ts > greets informally\""
    And I run "oid verify red \"tests/unit/greeting.test.ts > greets informally\" --decide business_assertion"
    Then the command succeeds
    And the output starts with "red: valid (business_assertion)"
    And the checkpoint records the step "tdd_red"
    And the checkpoint records an external decision

  Scenario: A decision that the failure is a test bug is not a Red
    Given the unit test file "tests/unit/greeting.test.ts" containing:
      """
      import { expect, it } from "vitest";
      import { greet } from "../../src/greeting.js";

      it("greets informally", () => {
        expect(greet("Ann")).toBe("Hi, Ann");
      });
      """
    And the changes are committed
    When I run "oid verify red \"tests/unit/greeting.test.ts > greets informally\""
    And I run "oid verify red \"tests/unit/greeting.test.ts > greets informally\" --decide test_bug"
    Then the command fails
    And the output starts with "red: not valid (test_bug)"
    And no checkpoint is recorded

  Scenario: A decision is refused when the run does not need one
    Given the unit test file "tests/unit/shout.test.ts" containing:
      """
      import { expect, it } from "vitest";
      import { shout } from "../../src/shout.js";

      it("shouts a greeting", () => {
        expect(shout("Ann")).toBe("HELLO, ANN");
      });
      """
    When I run "oid verify red \"tests/unit/shout.test.ts > shouts a greeting\" --decide business_assertion"
    Then the command fails
    And the error output contains "no recorded run of this target needs a decision"
    And no checkpoint is recorded

  Scenario: A test name that no test has is not a Red
    Given the unit test file "tests/unit/greeting.test.ts" containing:
      """
      import { expect, it } from "vitest";
      import { greet } from "../../src/greeting.js";

      it("greets by name", () => {
        expect(greet("Ann")).toBe("Hello, Ann");
      });
      """
    When I run "oid verify red \"tests/unit/greeting.test.ts > greets nobody\""
    Then the command fails
    And the output starts with "red: not valid (test_bug)"
    And the output contains "no test named \"greets nobody\""
    And no checkpoint is recorded

  Scenario: A test name that several tests share asks for the full name
    Given the unit test file "tests/unit/greeting.test.ts" containing:
      """
      import { describe, expect, it } from "vitest";
      import { greet } from "../../src/greeting.js";

      describe("formal", () => {
        it("greets", () => {
          expect(greet("Ann")).toBe("Good day, Ann");
        });
      });

      describe("informal", () => {
        it("greets", () => {
          expect(greet("Ann")).toBe("Hi, Ann");
        });
      });
      """
    When I run "oid verify red \"tests/unit/greeting.test.ts > greets\""
    Then the command fails
    And the error output contains "formal greets"
    And the error output contains "informal greets"
    And no checkpoint is recorded

  Scenario: The copies of files that checkpoints keep are not run as tests
    Given the unit test file "tests/unit/greeting.test.ts" containing:
      """
      import { expect, it } from "vitest";
      import { greet } from "../../src/greeting.js";

      it("greets informally", () => {
        expect(greet("Ann")).toBe("Hi, Ann");
      });
      """
    When I run "oid verify red \"tests/unit/greeting.test.ts > greets informally\""
    And I run "oid verify red \"tests/unit/greeting.test.ts > greets informally\""
    Then the command needs a decision
    And the output starts with "red: needs a decision"
    And the output contains "Hi, Ann"
    And the output does not contain "cannot be found"
    And the checkpoint keeps a copy of "tests/unit/greeting.test.ts"
