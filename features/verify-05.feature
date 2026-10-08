@FR-VERIFY-05
Feature: Check the integrity of a change

  Background:
    Given a TypeScript project with unit tests
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
      """
    And the step definitions file "features/steps/greeting.steps.ts" containing:
      """
      import { Given } from "@cucumber/cucumber";

      Given("the greeting for Ann", function () {});
      """
    And the feature file "features/greeting.feature" containing:
      """
      @FR-GREETING-01
      Feature: Greeting

        Scenario: Greet Ann
          Given the greeting for Ann
      """
    And the project is a git repository with its files committed

  Scenario: While writing tests, a change to source code and forbidden patterns in added lines are violations
    Given a started feature "FR-GREETING-01" at step "tdd_red"
    And the focus is on "FR-GREETING-01"
    And the source file "src/greeting.ts" containing:
      """
      export function greet(name: string): string {
        return `Hi, ${name}`;
      }
      """
    And the unit test file "tests/unit/greeting.test.ts" containing:
      """
      import { readFileSync } from "node:fs";
      import { expect, it } from "vitest";

      it.only("greets by name", () => {
        const expected = readFileSync("tests/fixtures/names.txt", "utf8");
        const code = readFileSync("src/greeting.ts", "utf8");
        expect(code).toContain(expected);
      });
      """
    When I run "oid verify integrity"
    Then the command fails
    And the output contains "src/greeting.ts changed source code while writing tests"
    And the output contains "tests/unit/greeting.test.ts:4 forbidden pattern \".only(\" in a test"
    And the output contains "tests/unit/greeting.test.ts:6 reads source code as text"
    And the output does not contain "tests/unit/greeting.test.ts:5"
    And the output does not contain "integrity: ok"

  Scenario: While writing code, a change to tests, steps or features and forbidden patterns in added lines are violations
    Given a started feature "FR-GREETING-01" at step "tdd_green"
    And the focus is on "FR-GREETING-01"
    And the source file "src/greeting.ts" containing:
      """
      export function greet(name: string): string {
        // @ts-ignore
        return `Hello, ${name}`;
      }
      """
    And the unit test file "tests/unit/greeting.test.ts" containing:
      """
      import { expect, it } from "vitest";

      it("greets by name", () => {
        expect(1).toBe(1);
      });
      """
    And the step definitions file "features/steps/greeting.steps.ts" containing:
      """
      import { Given } from "@cucumber/cucumber";

      Given("the greeting for Ann", function () {
        this.skipped = true;
      });
      """
    And the feature file "features/greeting.feature" containing:
      """
      @FR-GREETING-01
      Feature: Greeting

        Scenario: Greet Ann
          Given the greeting for Ann
          Then nothing is checked
      """
    When I run "oid verify integrity"
    Then the command fails
    And the output contains "src/greeting.ts:2 forbidden pattern \"@ts-ignore\" in source"
    And the output contains "tests/unit/greeting.test.ts changed a test while writing code"
    And the output contains "features/steps/greeting.steps.ts changed a test while writing code"
    And the output contains "features/greeting.feature changed a test while writing code"
    And the output does not contain "src/greeting.ts changed"

  Scenario: Only what changed since the last verification counts
    Given a started feature "FR-SHOUT-01" at step "tdd_red"
    And the focus is on "FR-SHOUT-01"
    And the unit test file "tests/unit/shout.test.ts" containing:
      """
      import { expect, it } from "vitest";
      import { shout } from "../../src/shout.js";

      it("shouts a greeting", () => {
        expect(shout("Ann")).toBe("HELLO, ANN");
      });
      """
    When I run "oid verify red \"tests/unit/shout.test.ts > shouts a greeting\""
    Then the command succeeds
    Given a progress file containing:
      """
      {
        "current_focus": "FR-SHOUT-01",
        "features": [
          {
            "id": "FR-SHOUT-01",
            "title": "Shout",
            "status": "in_progress",
            "cycle_step": "tdd_green",
            "scenarios": []
          }
        ]
      }
      """
    And the source file "src/shout.ts" containing:
      """
      export function shout(name: string): string {
        return `Hello, ${name}`.toUpperCase();
      }
      """
    When I run "oid verify integrity"
    Then the command succeeds
    And the output starts with "integrity: ok"
    Given the unit test file "tests/unit/shout.test.ts" containing:
      """
      import { expect, it } from "vitest";
      import { shout } from "../../src/shout.js";

      it("shouts a greeting", () => {
        expect(shout("Ann")).toBeDefined();
      });
      """
    When I run "oid verify integrity"
    Then the command fails
    And the output contains "tests/unit/shout.test.ts changed a test while writing code"
    And the output does not contain "src/shout.ts"

  Scenario: An approved feature file must not change, in any step
    Given a started feature "FR-GREETING-01" at step "quality_gate"
    And the focus is on "FR-GREETING-01"
    And the feature file "features/greeting.feature" containing:
      """
      @FR-GREETING-01
      Feature: Greeting

        Scenario: Greet Ann
          Given the greeting for Ann
          Then nothing is checked
      """
    When I run "oid verify integrity"
    Then the command fails
    And the output contains "features/greeting.feature changed an approved feature file"

  Scenario: A feature file being written is not approved yet, and the step can be given
    Given no feature is focused
    And the feature file "features/greeting.feature" containing:
      """
      @FR-GREETING-01
      Feature: Greeting

        Scenario: Greet Ann
          Given the greeting for Ann
          Then nothing is checked
      """
    When I run "oid verify integrity"
    Then the command fails
    And the error output contains "no feature is focused: give the step with --step"
    When I run "oid verify integrity --step bdd_red"
    Then the command succeeds
    And the output starts with "integrity: ok"

  Scenario: A feature at bdd_red can remove its own scenario from a file shared with a done feature
    Given a completed feature "FR-GREETING-01" with a scenario "Greet Ann" marked "pass"
    And a started feature "FR-GREETING-02" at step "bdd_red"
    And the focus is on "FR-GREETING-02"
    And the feature file "features/greeting.feature" containing:
      """
      Feature: Greeting

        @FR-GREETING-01
        Scenario: Greet Ann
          Given the greeting for Ann

        @FR-GREETING-02
        Scenario: Greet Bob
          Given the greeting for Bob
      """
    And the changes are committed
    And the feature file "features/greeting.feature" containing:
      """
      Feature: Greeting

        @FR-GREETING-01
        Scenario: Greet Ann
          Given the greeting for Ann
      """
    When I run "oid verify integrity"
    Then the command succeeds
    And the output starts with "integrity: ok"

  Scenario: A scenario of a done feature in a shared file stays frozen while another feature is at bdd_red
    Given a completed feature "FR-GREETING-01" with a scenario "Greet Ann" marked "pass"
    And a started feature "FR-GREETING-02" at step "bdd_red"
    And the focus is on "FR-GREETING-02"
    And the feature file "features/greeting.feature" containing:
      """
      Feature: Greeting

        @FR-GREETING-01
        Scenario: Greet Ann
          Given the greeting for Ann

        @FR-GREETING-02
        Scenario: Greet Bob
          Given the greeting for Bob
      """
    And the changes are committed
    And the feature file "features/greeting.feature" containing:
      """
      Feature: Greeting

        @FR-GREETING-01
        Scenario: Greet Ann
          Given the greeting for Ann
          Then nothing is checked

        @FR-GREETING-02
        Scenario: Greet Bob
          Given the greeting for Bob
      """
    When I run "oid verify integrity"
    Then the command fails
    And the output contains "features/greeting.feature changed an approved feature file"
    And the output contains "Greet Ann"
    And the output does not contain "Greet Bob"

  Scenario: Moving a scenario of a feature at bdd_red to a done feature by its tag is a violation
    Given a completed feature "FR-GREETING-01" with a scenario "Greet Ann" marked "pass"
    And a started feature "FR-GREETING-02" at step "bdd_red"
    And the focus is on "FR-GREETING-02"
    And the feature file "features/greeting.feature" containing:
      """
      Feature: Greeting

        @FR-GREETING-01
        Scenario: Greet Ann
          Given the greeting for Ann

        @FR-GREETING-02
        Scenario: Greet Bob
          Given the greeting for Bob
      """
    And the changes are committed
    And the feature file "features/greeting.feature" containing:
      """
      Feature: Greeting

        @FR-GREETING-01
        Scenario: Greet Ann
          Given the greeting for Ann

        @FR-GREETING-01
        Scenario: Greet Bob
          Given the greeting for Bob
      """
    When I run "oid verify integrity"
    Then the command fails
    And the output contains "features/greeting.feature changed an approved feature file"
    And the output contains "Greet Bob"

  Scenario: The Background of a file shared with a done feature is frozen
    Given a completed feature "FR-GREETING-01" with a scenario "Greet Ann" marked "pass"
    And a started feature "FR-GREETING-02" at step "bdd_red"
    And the focus is on "FR-GREETING-02"
    And the feature file "features/greeting.feature" containing:
      """
      Feature: Greeting

        Background:
          Given the greeting for Ann

        @FR-GREETING-01
        Scenario: Greet Ann
          Given the greeting for Ann

        @FR-GREETING-02
        Scenario: Greet Bob
          Given the greeting for Bob
      """
    And the changes are committed
    And the feature file "features/greeting.feature" containing:
      """
      Feature: Greeting

        Background:
          Given the greeting for Ann
          And the greeting for Ann

        @FR-GREETING-01
        Scenario: Greet Ann
          Given the greeting for Ann

        @FR-GREETING-02
        Scenario: Greet Bob
          Given the greeting for Bob
      """
    When I run "oid verify integrity"
    Then the command fails
    And the output contains "features/greeting.feature changed an approved feature file"
    And the output contains "the parts outside scenarios"

  Scenario: At bdd_red, a scenario already recorded as pass must not change
    Given a started feature "FR-GREETING-02" at step "bdd_red" with a scenario "Greet Bob" marked "pass"
    And the focus is on "FR-GREETING-02"
    And the feature file "features/greeting.feature" containing:
      """
      Feature: Greeting

        @FR-GREETING-02
        Scenario: Greet Bob
          Given the greeting for Bob

        @FR-GREETING-02
        Scenario: Greet Cleo
          Given the greeting for Ann
      """
    And the changes are committed
    And the feature file "features/greeting.feature" containing:
      """
      Feature: Greeting

        @FR-GREETING-02
        Scenario: Greet Bob
          Given the greeting for Bob
          Then nothing is checked

        @FR-GREETING-02
        Scenario: Greet Cleo
          Given the greeting for Ann
          Then nothing is checked
      """
    When I run "oid verify integrity"
    Then the command fails
    And the output contains "features/greeting.feature changed an approved feature file"
    And the output contains "Greet Bob"
    And the output does not contain "Greet Cleo"
