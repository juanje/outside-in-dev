@FR-RUN-11
Feature: Rewrite the steps of a scenario when retries run out or an agent is blocked

  Background:
    Given a git project with a green suite
    And the project runs its BDD scenarios with cucumber and defines the steps of the scenario "Add to cart"
    And SPEC.md has the requirements "FR-CART-01" and "FR-CART-02"
    And progress.json records "FR-CART-01" as done with its passing scenario "Add to cart", and "FR-CART-02" as pending
    And the feature-writing agent writes for "FR-CART-02" the scenarios "Add a line" and "Remove a line"
    And the step-writing agent writes the steps of each scenario it is given, and they fail because the cart code does not exist yet
    And the project allows 1 retry for each state

  Scenario: After code exists, the human has the steps rewritten with a note, and the run goes on once they pass with the code and fail without it
    Given the test-writing agent writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
    And the coding agent writes the cart code that passes the unit test, but the scenario still fails
    And the step-writing agent's rewritten steps for "Add a line" pass with the cart code and fail without it
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve", "rewrite_steps" and "abort", and gives the note "count the lines with countCartLines"
    Then the human was asked once what to do with "Add a line", after 2 attempts of "TDD_RED", with the actions "retry", "rewrite", "rewrite_steps", "skip_scenario", "skip_fr" and "abort"
    And the event log of the run records a transition from "TDD_RED" to "BDD_RED" whose reason mentions "steps", "written again" and "the report names no unit test"
    And the second task of the step-writing agent includes "count the lines with countCartLines", "Add a line" and the failure of the scenario
    And the event log of the run records a transition from "BDD_RED" to "BDD_CHECK" whose reason mentions "Add a line", "passes with the code" and "fails without it"
    And the run's branch holds the commit "oid: checkpoint FR-CART-02 BDD_RED Add a line" twice
    And the worktree still has "src/cart.ts" as the coding agent wrote it
    And the event log of the run records a transition from "BDD_CHECK" to "BDD_RED" whose reason mentions "Add a line" and "passes"
    And progress.json of the worktree records "Add a line" as "pass"

  Scenario: After code exists, rewritten steps that still fail with that code on an assertion of the scenario are a Red, and the run goes on to TDD Red with the code kept
    Given the test-writing agent writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
    And the coding agent writes the cart code that passes the unit test, but the scenario still fails
    And the step-writing agent's rewritten steps for "Add a line" fail with the cart code on an assertion of the scenario
    And the test-writing agent then writes the unit test "cart lines > counts the lines it holds", and it fails because the cart code does not count them
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve", "rewrite_steps" and "abort", and gives the note "build the cart with the lines it is given"
    Then the event log of the run records 2 transitions from "BDD_RED" to "TDD_RED"
    And the worktree still has "src/cart.ts" as the coding agent wrote it
    And the task of the test-writing agent after the rewrite includes "Add a line" and the failure of the scenario
    And the saved session of the run keeps the unit test "cart lines > adds a line" for "Add a line"

  Scenario: After code exists, rewritten steps that fail with that code on an error oid cannot classify are put to the human, who accepts the Red, and the run goes on to TDD Red with the code kept
    Given the test-writing agent writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
    And the coding agent writes the cart code that passes the unit test, but the scenario still fails
    And the step-writing agent's rewritten steps for "Add a line" fail with the cart code on an error that is not an assertion
    And the test-writing agent then writes the unit test "cart lines > counts the lines it holds", and it fails because the cart code does not count them
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve", "rewrite_steps", "valid" and "abort"
    Then the human was asked once about the Red of "Add a line", with the actions "valid", "bug" and "trace"
    And the event log of the run records 2 transitions from "BDD_RED" to "TDD_RED"
    And the worktree still has "src/cart.ts" as the coding agent wrote it
    And the task of the test-writing agent after the rewrite includes "Add a line" and "the cart could not be built"

  Scenario: Steps that also pass without the code of the scenario are rejected, and the retries of BDD Red run out
    Given the test-writing agent writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
    And the coding agent writes the cart code that passes the unit test, but the scenario still fails
    And the step-writing agent's rewritten steps for "Add a line" pass with the cart code and also without it, in every attempt
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve", "rewrite_steps" and "abort", and gives the note "just make the scenario pass"
    Then the human was asked once what to do with "Add a line", after 2 attempts of "BDD_RED", with the actions "retry", "skip_scenario", "skip_fr" and "abort"
    And the question about the attempts of "BDD_RED" mentions "passes without the code of this scenario"
    And the event log of the run records a transition from "BDD_RED" to "ABORTED"
    And the event log of the run records no transition from "BDD_RED" to "BDD_CHECK"
    And the worktree still has "src/cart.ts" as the coding agent wrote it

  Scenario: Before any code, rewriting the steps restarts the scenario: its unit tests are gone and TDD Red follows once the steps fail validly
    Given the test-writing agent writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
    And the coding agent reports that it is blocked with the reason "the steps count lines the cart cannot give"
    And the step-writing agent's rewritten steps for "Add a line" fail because the cart code does not exist yet
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve", "rewrite_steps" and "abort", and gives the note "name the cart code in the steps"
    Then the human was asked once what to do about the blocked agent of "Add a line" at "CODE_GREEN", with the actions "retry", "rewrite", "rewrite_steps", "skip_scenario", "skip_fr" and "abort"
    And the event log of the run records a transition from "CODE_GREEN" to "BDD_RED" whose reason mentions "steps", "written again" and "the steps count lines the cart cannot give"
    And the second task of the step-writing agent includes "name the cart code in the steps" and "Add a line"
    And the event log of the run records a transition from "BDD_RED" to "TDD_RED" whose reason mentions "Add a line" and "fails validly"
    And the worktree has no "tests/unit/cart-lines.test.ts"
    And the event log of the run records no transition from "BDD_RED" to "BDD_CHECK"
