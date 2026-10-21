@FR-VERIFY-10
Feature: Prove a fixed test with a mutant

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
      import { describe, expect, it } from "vitest";
      import { greet } from "../../src/greeting.js";

      describe("greeting", () => {
        it("greets Ann", () => {
          expect(greet("Ann")).toContain("Ann");
        });
      });
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
    And a started feature "FR-GREETING-01" at step "tdd_green" with a scenario "Greet Ann politely" marked "pass"
    And the focus is on "FR-GREETING-01"

  Scenario: A step fixed with no code of this cycle to remove is proved with a mutant, and the feature returns to where it came from
    Given a Red of "FR-GREETING-01" was verified at step "tdd_red"
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
    And the step definitions file "features/steps/greeting.steps.ts" is changed to:
      """
      import { Given, Then } from "@cucumber/cucumber";
      import assert from "node:assert/strict";
      import { greet } from "../../src/greeting.js";

      Given("the greeting for Ann", function () {});

      Then("it is polite", function () {
        assert.equal(greet("Ann"), "Hello, Ann");
      });

      Then("it says hello to Ann", function () {
        assert.equal(greet("Ann"), "Hello, Ann");
      });
      """
    And I run "oid verify red features/greeting.feature:4 --mutant mutants/goodbye.diff"
    Then the command succeeds
    And the output starts with "red: returned to tdd_green"
    And the output contains "fails with the mutant"
    And the output contains "src/greeting.ts"
    And the feature "FR-GREETING-01" has the cycle step "tdd_green"
    And the feature "FR-GREETING-01" has the scenario "Greet Ann politely" marked "pass"
    And the scenario "Greet Ann politely" of "FR-GREETING-01" records the mutant:
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
    And the project has no verify lock

  Scenario: A unit test fixed with no code of this cycle to remove is proved with a mutant, and its Red records the diff
    Given a Red of "FR-GREETING-01" was verified at step "tdd_red"
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
    When I run "oid progress step FR-GREETING-01 tdd_red"
    And the unit test file "tests/unit/greeting.test.ts" is changed to:
      """
      import { describe, expect, it } from "vitest";
      import { greet } from "../../src/greeting.js";

      describe("greeting", () => {
        it("greets Ann", () => {
          expect(greet("Ann")).toBe("Hello, Ann");
        });
      });
      """
    And I run "oid verify red \"tests/unit/greeting.test.ts > greets Ann\" --mutant mutants/goodbye.diff"
    Then the command succeeds
    And the output starts with "red: returned to tdd_green"
    And the output contains "fails with the mutant"
    And the output contains "src/greeting.ts"
    And the feature "FR-GREETING-01" has the cycle step "tdd_green"
    And the checkpoint records the step "tdd_red"
    And the checkpoint records the mutant:
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

  Scenario: The mutant can be given on standard input
    Given a Red of "FR-GREETING-01" was verified at step "tdd_red"
    And the standard input holds the mutant:
      """
      --- a/src/greeting.ts
      +++ b/src/greeting.ts
      @@ -1,3 +1,3 @@
       export function greet(name: string): string {
      -  return `Hello, ${name}`;
      +  return `Goodbye, ${name}`;
       }
      """
    When I run "oid progress step FR-GREETING-01 tdd_red"
    And the unit test file "tests/unit/greeting.test.ts" is changed to:
      """
      import { describe, expect, it } from "vitest";
      import { greet } from "../../src/greeting.js";

      describe("greeting", () => {
        it("greets Ann", () => {
          expect(greet("Ann")).toBe("Hello, Ann");
        });
      });
      """
    And I run "oid verify red \"tests/unit/greeting.test.ts > greets Ann\" --mutant -"
    Then the command succeeds
    And the output starts with "red: returned to tdd_green"
    And the checkpoint records the mutant:
      """
      --- a/src/greeting.ts
      +++ b/src/greeting.ts
      @@ -1,3 +1,3 @@
       export function greet(name: string): string {
      -  return `Hello, ${name}`;
      +  return `Goodbye, ${name}`;
       }
      """

  Scenario: A diff that does not apply is refused and nothing changes
    Given a Red of "FR-GREETING-01" was verified at step "tdd_red"
    And the mutant file "mutants/stale.diff" containing:
      """
      --- a/src/greeting.ts
      +++ b/src/greeting.ts
      @@ -1,3 +1,3 @@
       export function greet(person: string): string {
      -  return `Hi, ${person}`;
      +  return `Goodbye, ${person}`;
       }
      """
    When I run "oid progress step FR-GREETING-01 tdd_red"
    And the unit test file "tests/unit/greeting.test.ts" is changed to:
      """
      import { describe, expect, it } from "vitest";
      import { greet } from "../../src/greeting.js";

      describe("greeting", () => {
        it("greets Ann", () => {
          expect(greet("Ann")).toBe("Hello, Ann");
        });
      });
      """
    And I run "oid verify red \"tests/unit/greeting.test.ts > greets Ann\" --mutant mutants/stale.diff"
    Then the command fails
    And the output starts with "red: mutant refused"
    And the output contains "the diff does not apply"
    And the feature "FR-GREETING-01" has the cycle step "tdd_red"
    And no checkpoint is recorded
    And the file "src/greeting.ts" contains:
      """
      export function greet(name: string): string {
        return `Hello, ${name}`;
      }
      """

  Scenario: A test that still passes with the mutant is refused
    Given a Red of "FR-GREETING-01" was verified at step "tdd_red"
    And the mutant file "mutants/unused.diff" containing:
      """
      --- a/src/greeting.ts
      +++ b/src/greeting.ts
      @@ -1,3 +1,4 @@
       export function greet(name: string): string {
         return `Hello, ${name}`;
       }
      +export const unused = 1;
      """
    When I run "oid progress step FR-GREETING-01 tdd_red"
    And the unit test file "tests/unit/greeting.test.ts" is changed to:
      """
      import { describe, expect, it } from "vitest";
      import { greet } from "../../src/greeting.js";

      describe("greeting", () => {
        it("greets Ann", () => {
          expect(greet("Ann")).toContain("Ann");
        });
      });
      """
    And I run "oid verify red \"tests/unit/greeting.test.ts > greets Ann\" --mutant mutants/unused.diff"
    Then the command fails
    And the output starts with "red: mutant refused"
    And the output contains "the test still passes with the mutant"
    And the feature "FR-GREETING-01" has the cycle step "tdd_red"
    And no checkpoint is recorded
    And the file "src/greeting.ts" contains:
      """
      export function greet(name: string): string {
        return `Hello, ${name}`;
      }
      """

  Scenario: A failure that is not an assertion of the test is refused
    Given a Red of "FR-GREETING-01" was verified at step "tdd_red"
    And the mutant file "mutants/rename.diff" containing:
      """
      --- a/src/greeting.ts
      +++ b/src/greeting.ts
      @@ -1,3 +1,3 @@
      -export function greet(name: string): string {
      +export function greetEveryone(name: string): string {
         return `Hello, ${name}`;
       }
      """
    When I run "oid progress step FR-GREETING-01 tdd_red"
    And the unit test file "tests/unit/greeting.test.ts" is changed to:
      """
      import { describe, expect, it } from "vitest";
      import { greet } from "../../src/greeting.js";

      describe("greeting", () => {
        it("greets Ann", () => {
          expect(greet("Ann")).toBe("Hello, Ann");
        });
      });
      """
    And I run "oid verify red \"tests/unit/greeting.test.ts > greets Ann\" --mutant mutants/rename.diff"
    Then the command fails
    And the output starts with "red: mutant refused"
    And the output contains "the test fails with the mutant, but not on an assertion of the test"
    And the feature "FR-GREETING-01" has the cycle step "tdd_red"
    And no checkpoint is recorded
    And the file "src/greeting.ts" contains:
      """
      export function greet(name: string): string {
        return `Hello, ${name}`;
      }
      """

  Scenario: The source is restored when the run of the test does not end
    Given a Red of "FR-GREETING-01" was verified at step "tdd_red"
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
    And the unit command of the project is a runner that never ends and starts a child process
    And the limit "limits.command_timeout_s" of the project is 1
    When I run "oid progress step FR-GREETING-01 tdd_red"
    And I run "oid verify red \"tests/unit/greeting.test.ts > greets Ann\" --mutant mutants/goodbye.diff"
    Then the command fails
    And the output contains "limits.command_timeout_s"
    And the feature "FR-GREETING-01" has the cycle step "tdd_red"
    And no process started by the runner is still alive
    And the project has no verify lock
    And the file "src/greeting.ts" contains:
      """
      export function greet(name: string): string {
        return `Hello, ${name}`;
      }
      """

  Scenario: A unit test with no return to a Red is not a fix, and its mutant has nowhere to be recorded
    Given a Red of "FR-GREETING-01" was verified at step "tdd_red"
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
    When I run "oid verify red \"tests/unit/greeting.test.ts > greets Ann\" --mutant mutants/goodbye.diff"
    Then the command fails
    And the output starts with "red: mutant refused"
    And the output contains "the feature did not go back to a Red"
    And the feature "FR-GREETING-01" has the cycle step "tdd_green"
    And no checkpoint is recorded

  Scenario: A mutant cannot be given together with a decision
    When I run "oid verify red \"tests/unit/greeting.test.ts > greets Ann\" --mutant mutants/goodbye.diff --decide test_bug"
    Then the command fails
    And the error output contains "--mutant cannot be used with --decide"

  Scenario: A mutant file that does not exist is a usage error
    When I run "oid verify red features/greeting.feature:4 --mutant mutants/none.diff"
    Then the command fails
    And the error output contains "mutant file mutants/none.diff not found"

  Scenario: After a revise, a scenario whose text changed is proved with a mutant and the feature can leave bdd_red
    Given the mutant file "mutants/goodbye.diff" containing:
      """
      --- a/src/greeting.ts
      +++ b/src/greeting.ts
      @@ -1,3 +1,3 @@
       export function greet(name: string): string {
      -  return `Hello, ${name}`;
      +  return `Goodbye, ${name}`;
       }
      """
    When I run "oid progress revise FR-GREETING-01"
    And the feature file "features/greeting.feature" is changed to:
      """
      @FR-GREETING-01
      Feature: Greeting

        Scenario: Greet Ann politely
          Given the greeting for Ann
          Then it is polite
          And it says hello to Ann
      """
    And I run "oid verify red features/greeting.feature:4 --mutant mutants/goodbye.diff"
    Then the command succeeds
    And the output starts with "red: mutant proved"
    And the output contains "src/greeting.ts"
    And the feature "FR-GREETING-01" has the cycle step "bdd_red"
    And the scenario "Greet Ann politely" of "FR-GREETING-01" records the mutant:
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
    When a later green ran the scenario "Greet Ann politely" of "FR-GREETING-01"
    And I run "oid progress step FR-GREETING-01 quality_gate"
    Then the command succeeds
    And the feature "FR-GREETING-01" has the cycle step "quality_gate"

  Scenario: After a revise, a new scenario is proved with a mutant too
    Given the mutant file "mutants/goodbye.diff" containing:
      """
      --- a/src/greeting.ts
      +++ b/src/greeting.ts
      @@ -1,3 +1,3 @@
       export function greet(name: string): string {
      -  return `Hello, ${name}`;
      +  return `Goodbye, ${name}`;
       }
      """
    When I run "oid progress revise FR-GREETING-01"
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
    And the output starts with "red: mutant proved"
    And the feature "FR-GREETING-01" has the scenario "Greet Ann warmly" marked "pending"
    When a later green ran the scenarios "Greet Ann politely" and "Greet Ann warmly" of "FR-GREETING-01"
    And I run "oid progress step FR-GREETING-01 quality_gate"
    Then the command succeeds
    And the feature "FR-GREETING-01" has the cycle step "quality_gate"

  Scenario: After a revise, a scenario whose text changed and has no mutant keeps the feature at bdd_red, and the refusal names it
    When I run "oid progress revise FR-GREETING-01"
    And the feature file "features/greeting.feature" is changed to:
      """
      @FR-GREETING-01
      Feature: Greeting

        Scenario: Greet Ann politely
          Given the greeting for Ann
          Then it is polite
          And it says hello to Ann
      """
    And a later green ran the scenario "Greet Ann politely" of "FR-GREETING-01"
    And I run "oid progress step FR-GREETING-01 quality_gate"
    Then the command fails
    And the error output contains "Greet Ann politely"
    And the error output contains "mutant"
    And the feature "FR-GREETING-01" has the cycle step "bdd_red"

  Scenario: A mutant counts only for the scenario text it was proved on
    Given the mutant file "mutants/goodbye.diff" containing:
      """
      --- a/src/greeting.ts
      +++ b/src/greeting.ts
      @@ -1,3 +1,3 @@
       export function greet(name: string): string {
      -  return `Hello, ${name}`;
      +  return `Goodbye, ${name}`;
       }
      """
    When I run "oid progress revise FR-GREETING-01"
    And the feature file "features/greeting.feature" is changed to:
      """
      @FR-GREETING-01
      Feature: Greeting

        Scenario: Greet Ann politely
          Given the greeting for Ann
          Then it is polite
          And it says hello to Ann
      """
    And I run "oid verify red features/greeting.feature:4 --mutant mutants/goodbye.diff"
    Then the command succeeds
    When the feature file "features/greeting.feature" is changed to:
      """
      @FR-GREETING-01
      Feature: Greeting

        Scenario: Greet Ann politely
          Given the greeting for Ann
          Then it says hello to Ann
          And it is polite
      """
    And a later green ran the scenario "Greet Ann politely" of "FR-GREETING-01"
    And I run "oid progress step FR-GREETING-01 quality_gate"
    Then the command fails
    And the error output contains "Greet Ann politely"
    And the error output contains "mutant"
    And the feature "FR-GREETING-01" has the cycle step "bdd_red"

  Scenario: A diff that changes anything but the source is refused before it is applied
    Given a Red of "FR-GREETING-01" was verified at step "tdd_red"
    And the mutant file "mutants/weaken.diff" containing:
      """
      --- a/features/steps/greeting.steps.ts
      +++ b/features/steps/greeting.steps.ts
      @@ -11,3 +11,3 @@
       Then("it says hello to Ann", function () {
      -  assert.equal(greet("Ann"), "Hello, Ann");
      +  assert.ok(true);
       });
      """
    When I run "oid progress step FR-GREETING-01 bdd_red"
    And I run "oid verify red features/greeting.feature:4 --mutant mutants/weaken.diff"
    Then the command fails
    And the output starts with "red: mutant refused"
    And the output contains "features/steps/greeting.steps.ts"
    And the output contains "the mutant may change only the source"
    And the feature "FR-GREETING-01" has the cycle step "bdd_red"
    And no checkpoint is recorded
    And the file "features/steps/greeting.steps.ts" contains:
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

  Scenario: oid verify --help shows the mutant option
    When I run "oid verify --help"
    Then the command succeeds
    And the output contains "--mutant"
