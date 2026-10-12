@FR-RUN-11
Feature: Rewrite or skip when retries run out or an agent is blocked

  Background:
    Given a git project with a green suite
    And the project runs its BDD scenarios with cucumber and defines the steps of the scenario "Add to cart"
    And SPEC.md has the requirements "FR-CART-01" and "FR-CART-02"
    And progress.json records "FR-CART-01" as done with its passing scenario "Add to cart", and "FR-CART-02" as pending
    And the feature-writing agent writes for "FR-CART-02" the scenarios "Add a line" and "Remove a line"
    And the step-writing agent writes the steps of each scenario it is given, and they fail because the cart code does not exist yet

  Scenario: A blocked coding agent puts its reason to the human, with the actions to go on
    Given the test-writing agent writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
    And the coding agent reports that it is blocked with the reason "the unit test expects a rounding the spec does not define"
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "abort"
    Then the human was asked once what to do about the blocked agent of "Add a line" at "CODE_GREEN", with the actions "retry", "rewrite", "rewrite_steps", "skip_scenario", "skip_fr" and "abort"
    And the question about the blocked agent mentions "the unit test expects a rounding the spec does not define"
    And the event log of the run records a transition from "CODE_GREEN" to "ABORTED"
    And the process exits with code 2
    And the worktree is kept

  Scenario: There is no unit test to rewrite while the steps are being written, so the question does not offer it
    Given the step-writing agent reports that it is blocked with the reason "the scenario needs a payment service"
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "abort"
    Then the human was asked once what to do about the blocked agent of "Add a line" at "BDD_RED", with the actions "retry", "skip_scenario", "skip_fr" and "abort"
    And the question about the blocked agent mentions "the scenario needs a payment service"
    And the event log of the run records a transition from "BDD_RED" to "ABORTED"

  Scenario: The human retries a blocked agent with a note, and the note goes to one more attempt on the strongest model
    Given the project allows 3 retries for each state
    And the user's setup assigns the models "fake/fast", "fake/default" and "fake/strong"
    And the test-writing agent writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
    And the coding agent reports that it is blocked in its first attempt with the reason "the unit test expects a rounding the spec does not define", then writes the cart code that passes the unit test and the scenario
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve", "retry" and "abort", and gives the note "round to the nearest cent"
    Then the human was asked once what to do about the blocked agent of "Add a line" at "CODE_GREEN", with the actions "retry", "rewrite", "rewrite_steps", "skip_scenario", "skip_fr" and "abort"
    And the event log of the run records an "agent_start" of "CODE_GREEN" with the attempt 2, the model "fake/strong" and the thinking level "high"
    And the second task of the coding agent includes "attempt 2" and "round to the nearest cent"
    And the event log of the run records a transition from "CODE_GREEN" to "BDD_CHECK"

  Scenario: The human has the last unit test rewritten after a blocked coding agent, and the run goes back to before that test
    Given the test-writing agent writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
    And the test-writing agent writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
    And the coding agent reports that it is blocked in its first attempt with the reason "the unit test expects a rounding the spec does not define", then writes the cart code that passes the unit test and the scenario
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve", "rewrite" and "abort", and gives the note "do not test the rounding"
    Then the human was asked once what to do about the blocked agent of "Add a line" at "CODE_GREEN", with the actions "retry", "rewrite", "rewrite_steps", "skip_scenario", "skip_fr" and "abort"
    And the event log of the run records a transition from "CODE_GREEN" to "TDD_RED" whose reason mentions "written again" and "the unit test expects a rounding the spec does not define"
    And the second task of the test-writing agent includes "do not test the rounding"
    And the run's branch holds the commit "oid: checkpoint FR-CART-02 TDD_RED Add a line" once
    And the saved session records the unit tests "tests/unit/cart-lines.test.ts > cart lines > adds a line" and no other for the scenario "Add a line"
    And the event log of the run records 2 transitions from "TDD_RED" to "CODE_GREEN"
    And the event log of the run records a transition from "CODE_GREEN" to "BDD_CHECK"

  Scenario: When the attempts to write a unit test run out, a rewrite starts the test writing again with the note
    Given the project allows 1 retry for each state
    And the test-writing agent writes no unit test in its first two attempts, then writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
    And the coding agent writes the cart code that passes the unit test and the scenario
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve", "rewrite" and "abort", and gives the note "write the test for countLines of src/lines.ts"
    Then the human was asked once what to do with "Add a line", after 2 attempts of "TDD_RED", with the actions "retry", "rewrite", "rewrite_steps", "skip_scenario", "skip_fr" and "abort"
    And the event log of the run records a transition from "TDD_RED" to "TDD_RED" whose reason mentions "written again" and "the report names no unit test"
    And the third task of the test-writing agent includes "write the test for countLines of src/lines.ts" and "Add a line"
    And the event log of the run records a transition from "TDD_RED" to "CODE_GREEN"
