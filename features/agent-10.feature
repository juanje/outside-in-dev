@FR-AGENT-10
Feature: Every rejection says what to do next

  A rejection is printed in one layout everywhere: its first line says what failed, then "Evidence:" holds the failing assertion, the undefined step or the file, and "Next:" holds the action to take.

  @run
  Rule: A gate of oid run rejects an attempt with the three parts

    Background:
      Given a git project with a green suite
      And the project runs its BDD scenarios with cucumber and defines the steps of the scenario "Add to cart"
      And SPEC.md has the requirements "FR-CART-01" and "FR-CART-02"
      And progress.json records "FR-CART-01" as done with its passing scenario "Add to cart", and "FR-CART-02" as pending
      And the feature-writing agent writes for "FR-CART-02" the scenarios "Add a line" and "Remove a line"
      And the step-writing agent writes the steps of each scenario it is given, and they fail because the cart code does not exist yet

    Scenario: A step file with an undefined step is rejected with the step and the way to define it, and the next attempt and the output carry all three
      Given the project allows 2 retries for each state
      And the step-writing agent's first attempt writes steps where one step has no definition, and also a file "features/steps/stray.steps.ts"
      When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "abort"
      Then the event log of the run records an "attempt_rejected" of "BDD_RED" with the attempt 1 and the reason mentioning "did not run (status UNDEFINED)"
      And that reason has the evidence "Evidence:" naming the undefined step
      And that reason has a "Next:" that tells the agent to define the undefined step in a step file
      And the second task of the step-writing agent includes "Evidence:" and "Next:"
      And the output contains "[BDD_RED] attempt 1 rejected: FR-CART-02"
      And the output contains "Next:"

    Scenario: A test-writing agent that names no unit test is told to name one
      Given the project allows 1 retry for each state
      And the test-writing agent writes no unit test in any attempt
      When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "abort"
      Then the event log of the run records an "attempt_rejected" of "TDD_RED" with the attempt 1 and the reason mentioning "the report names no unit test"
      And that reason has the evidence "Evidence:" naming the scenario "Add a line"
      And that reason has a "Next:" that tells the agent to name the unit test it wrote in the report
      And the second task of the test-writing agent includes "Evidence:" and "Next:"

    Scenario: Code that does not make the unit test pass is rejected with the failing test and the way to run it
      Given the project allows 1 retry for each state
      And the test-writing agent writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
      And the coding agent's first attempt writes code that does not make the unit test pass, and also a file "src/stray.ts"
      And the coding agent's second attempt writes the cart code that passes the unit test and the scenario
      When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "abort"
      Then the event log of the run records an "attempt_rejected" of "CODE_GREEN" with the attempt 1 and the reason mentioning "Code Green is not green"
      And that reason has the evidence "Evidence:" naming the failing unit test "adds a line"
      And that reason has a "Next:" that tells the agent to check the unit test with the try tool
      And the second task of the coding agent includes "Evidence:" and "Next:"

    Scenario: A fix of the quality gate that leaves errors is rejected with the errors and the way to clear them
      Given the project allows 1 retry for each state
      And the project lints its source with a linter that reports every TODO comment
      And the agents write for each of the two scenarios a failing unit test and the cart code that passes it and the scenario
      And the detectors find nothing
      And the coding agent leaves a TODO comment in the cart code of the second scenario, and leaves it when it is asked to fix the lint error
      When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "abort"
      Then the event log of the run records an "attempt_rejected" of "QUALITY_FIX" with the attempt 1 and the reason mentioning "lint error"
      And that reason has the evidence "Evidence:" naming the rule "no-todo"
      And that reason has a "Next:" that tells the agent to fix the errors and run the linter on the file
      And the fourth task of the coding agent includes "Evidence:" and "Next:"

    Scenario: A Red that the human judges a bug tells the next attempt what to fix
      Given the project allows 1 retry for each state
      And the step-writing agent's first attempt writes steps that fail with an error that is not an assertion, and its second attempt writes steps that fail because the cart code does not exist yet
      When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve", "bug" and "abort"
      Then the event log of the run records an "attempt_rejected" of "BDD_RED" with the attempt 1 and the reason mentioning "the person judged the failure to be a bug in the step definitions"
      And that reason has the evidence "Evidence:" naming the failure "the cart could not be built"
      And that reason has a "Next:" that tells the agent to fix the step definitions so the scenario fails on the missing behaviour
      And the second task of the step-writing agent includes "Evidence:" and "Next:"

    Scenario: With no retries allowed, the error that ends the run carries what failed, the evidence and what to do next
      Given the project allows 0 retries for each state
      And the step-writing agent writes steps where one step has no definition
      When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
      Then the event log of the run records an error mentioning "did not run (status UNDEFINED)"
      And the event log of the run records an error mentioning "Evidence:"
      And the event log of the run records an error mentioning "Next:"

    Scenario: A unit test that passes at once is rejected with the test and the behaviour to test instead
      Given the project allows 1 retry for each state
      And the test-writing agent's first attempt writes a unit test that passes at once, and its second attempt writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
      And the coding agent writes the cart code that passes the unit test and the scenario
      When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
      Then the event log of the run records an "attempt_rejected" of "TDD_RED" with the attempt 1 and the reason mentioning "passes without new implementation"
      And that reason has the evidence "Evidence:" naming the unit test "cart lines > adds a line"
      And that reason has a "Next:" that tells the agent to test a behaviour the code does not have yet

    Scenario: A rejection longer than the plain line allows reaches the next attempt whole, and the cut line still ends with the next action
      Given the project allows 1 retry for each state
      And the step-writing agent's first attempt writes steps that fail with an error that is not an assertion, and its second attempt writes steps that fail because the cart code does not exist yet
      When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve", "bug" and "abort"
      Then the second task of the step-writing agent includes "the cart could not be built" and "features/FR-CART-02.feature:5 When a line is added"
      And the plain output line of the "attempt_rejected" of "BDD_RED" is cut and still contains "Next:"

  Rule: oid verify refuses with the three parts

    Scenario: oid verify red on a test that passes says what failed, the test and what to write instead
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
      And the project is a git repository with its files committed
      When I run "oid verify red \"tests/unit/greeting.test.ts > greets by name\""
      Then the command fails
      And the output starts with "red: not valid (test_bug): the test passes without new implementation"
      And the output has the evidence "Evidence:" naming "tests/unit/greeting.test.ts > greets by name"
      And the output has a "Next:" that tells the author to test a behaviour the code does not have yet and to run "oid verify red" again

    Scenario: oid verify green says which test and which type error regress, and what to do with them
      Given a TypeScript project with unit tests
      And the source file "src/greeting.ts" containing:
        """
        export function greet(name: string): string {
          return 42;
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
      And the project is a git repository with its files committed
      When I run "oid verify green"
      Then the command fails
      And the output starts with "green: 2 problem(s)"
      And the output has the evidence "Evidence:" naming "tests/unit/greeting.test.ts > greets by name" and "TS2322"
      And the output has a "Next:" that tells the author to fix the code, not the tests, and to run "oid verify green" again

    Scenario: oid verify integrity names the files, and the move that allows the change
      Given a TypeScript project with unit tests
      And the source file "src/greeting.ts" containing:
        """
        export function greet(name: string): string {
          return `Hello, ${name}`;
        }
        """
      And the project is a git repository with its files committed
      And a started feature "FR-GREETING-01" at step "tdd_red"
      And the focus is on "FR-GREETING-01"
      And the source file "src/greeting.ts" containing:
        """
        export function greet(name: string): string {
          return `Hi, ${name}`;
        }
        """
      When I run "oid verify integrity"
      Then the command fails
      And the output contains "src/greeting.ts changed source code while writing tests"
      And the output has the evidence "Evidence:" naming "src/greeting.ts"
      And the output has a "Next:" that names the command "oid progress step FR-GREETING-01 tdd_green" after verifying the Red

  Rule: oid try refuses with the three parts

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

    Scenario: oid try on a failing test says what failed, the failure and what to do next
      When I run "oid try \"tests/unit/greeting.test.ts > greets in capitals\""
      Then the command fails
      And the output contains "test: failed"
      And the output has the evidence "Evidence:" naming "expected 'Hello, Ann' to be 'HELLO, ANN'"
      And the output has a "Next:" that tells the author to fix what failed and to run "oid try" again

  Rule: A tool call that oid denies comes back with the three parts

    Background:
      Given a git project with source, unit tests, features, "progress.json" and ".outside-in/"

    Scenario Outline: A tool call that the sandbox blocks says what was blocked, the path or command, and what is allowed instead
      Given oid opened an agent session for the step <step>
      When <call>
      Then the call is blocked
      And the reason says "<blocked>"
      And the reason has the evidence "Evidence:" naming "<evidence>"
      And the reason has a "Next:" that names "<next>"

      Examples:
        | step       | call                                               | blocked                                  | evidence      | next                    |
        | TDD_RED    | the agent calls "write" on "src/cart.ts"           | is not writable in this step            | src/cart.ts   | tests/unit/**/*.test.ts |
        | TDD_RED    | the agent calls "read" on "src/cart.ts"            | is not readable in this step            | src/cart.ts   | features/**/*.feature   |
        | CODE_GREEN | the agent runs the shell command: git commit -am x | git stays with the orchestrator          | git commit    | npx vitest run          |
        | BDD_RED    | the agent runs the shell command: ls               | This step has no shell                   | ls            | the ls tool             |

    Scenario: The try tool refuses a target outside the worktree and says which targets it accepts
      Given the project's unit test and type check pass
      And oid opened an agent session for the step TDD_RED
      When the agent tries "../outside.test.ts > adds a line"
      Then the try tool refuses, naming the worktree
      And the refusal has the evidence "Evidence:" naming "../outside.test.ts"
      And the refusal has a "Next:" that names "tests/unit/cart.test.ts"

    Scenario: A report with a field its form does not allow names the field and gives the form to send
      Given oid opened an agent session for the step TDD_RED
      When the agent reports done with no files, the summary "No unit logic is left" and the reason "no_unit_logic_left", and also the test "no_unit_logic_left"
      Then the report is refused
      And the report refusal has the evidence "Evidence:" naming "test"
      And the report refusal has a "Next:" that names the fields "files", "summary" and "reason" and the value "no_unit_logic_left"

    Scenario: A blocked report without its detail names the missing field
      Given oid opened an agent session for the step BDD_RED
      When the agent reports blocked with the reason "spec_gap" and no detail
      Then the report is refused
      And the report refusal has the evidence "Evidence:" naming "detail"
      And the report refusal has a "Next:" that names the fields "reason" and "detail"

    Scenario: In the test-writing step a test that is not of the form test file and test name is refused with the form
      Given oid opened an agent session for the step TDD_RED
      When the agent reports done with the file "tests/unit/cart.test.ts", the summary "Added a test" and the test "adds a line"
      Then the report is refused
      And the report refusal has the evidence "Evidence:" naming "adds a line"
      And the report refusal has a "Next:" that names "<test file> > <test name>"

    Scenario: A read the sandbox blocks gets a Next that lists what the step may read, not what it may write
      Given oid opened an agent session for the step FEATURE_WRITE
      When the agent calls "read" on "features/steps/setup.steps.ts"
      Then the call is blocked
      And the reason names "features/steps/setup.steps.ts"
      And the reason has a "Next:" that begins with "You may read:" and names "SPEC.md"
      And the reason has a "Next:" that does not name "You may write"
