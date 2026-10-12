@FR-RUN-11
Feature: Skip a scenario or a feature when retries run out or an agent is blocked

  Background:
    Given a git project with a green suite
    And the project runs its BDD scenarios with cucumber and defines the steps of the scenario "Add to cart"
    And SPEC.md has the requirements "FR-CART-01" and "FR-CART-02"
    And progress.json records "FR-CART-01" as done with its passing scenario "Add to cart", and "FR-CART-02" as pending
    And the feature-writing agent writes for "FR-CART-02" the scenarios "Add a line" and "Remove a line"
    And the step-writing agent writes the steps of each scenario it is given, and they fail because the cart code does not exist yet

  Scenario: Skipping a scenario tags it @wip, keeps its partial work under a ref of the run, and the run goes on with the next scenario
    Given the project limits the inner loop to 2 iterations for each scenario
    And the agents write two unit tests and two pieces of cart code, and the scenario still fails after both
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "skip_scenario"
    Then the human was asked once what to do with "Add a line", after 2 iterations, with the actions "retry", "rewrite", "rewrite_steps", "skip_scenario", "skip_fr" and "abort"
    And the event log of the run records a transition from "BDD_CHECK" to "BDD_RED" whose reason mentions "Add a line", "@wip" and "still red after 2 iterations"
    And in the feature file "features/FR-CART-02.feature" of the worktree the scenario "Add a line" is tagged "@wip" and the scenario "Remove a line" is not
    And the ref "refs/oid/wip/" of the run for "FR-CART-02" holds the commit "wip(cart): FR-CART-02 Add a line" with the unit test and the cart code
    And the run's branch does not hold the commit "wip(cart): FR-CART-02 Add a line"
    And the worktree has no "src/cart.ts" and no "tests/unit/cart-lines.test.ts"
    And progress.json of the worktree records "Add a line" as "pending"
    And the saved session holds the hash of the edited "features/FR-CART-02.feature"
    And the event log of the run records no error mentioning "approved feature file"

  Scenario: A feature with a skipped scenario goes through the quality gate and stays in progress, never done
    Given the project allows 1 retry for each state
    And the test-writing agent writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
    And the coding agent writes the cart code that passes the unit test and the scenario
    And the step-writing agent's steps for "Remove a line" fail because the cart code does not exist yet
    And the detectors find nothing
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "skip_scenario"
    Then the human was asked once what to do with "Remove a line", after 2 attempts of "TDD_RED", with the actions "retry", "rewrite", "rewrite_steps", "skip_scenario", "skip_fr" and "abort"
    And the event log of the run records a transition from "TDD_RED" to "QUALITY_GATE" whose reason mentions "Remove a line", "@wip" and "the report names no unit test"
    And the event log of the run records a transition from "QUALITY_GATE" to "FR_COMMIT"
    And the run's branch holds no commit named "feat(cart): FR-CART-02 Feature FR-CART-02"
    And the run's branch ends with the commit "wip(cart): FR-CART-02 Feature FR-CART-02", one commit since the start of the run
    And the body of that commit lists the passing scenario "Add a line" and the skipped scenario "Remove a line" with its reason "the report names no unit test" and the ref that holds its partial work
    And "FR-CART-02" is in progress at "quality_gate" in the progress file of the worktree, with "Add a line" as "pass" and "Remove a line" as "pending"
    And the event log of the run records a transition from "FR_COMMIT" to "DONE" whose reason mentions "FR-CART-02" and "stays in progress"

  Scenario: Skipping a feature discards its changes, puts it back to pending and goes on with the next one
    Given SPEC.md has the requirements "FR-CART-01", "FR-CART-02" and "FR-CART-03"
    And progress.json tracks "FR-CART-03" as pending
    And the feature-writing agent writes for "FR-CART-03" the scenario "Clear the cart"
    And the project allows 1 retry for each state
    And the test-writing agent writes no unit test in any attempt
    When I run "oid run --fr FR-CART-02 FR-CART-03" with a terminal where the human answers "approve", "skip_fr" and "abort"
    Then the human was asked once what to do with "Add a line", after 2 attempts of "TDD_RED", with the actions "retry", "rewrite", "rewrite_steps", "skip_scenario", "skip_fr" and "abort"
    And the event log of the run records a transition from "TDD_RED" to "BDD_RED" whose reason mentions "FR-CART-02", "skipped", "the report names no unit test" and "FR-CART-03"
    And in the progress file of the worktree "FR-CART-02" is pending, with no cycle step and no scenarios
    And the worktree has no "features/FR-CART-02.feature" and has "features/FR-CART-03.feature"
    And the event log of the run records no error mentioning "approved feature file"

  Scenario: Skipping the only feature of the run leaves the branch as it started and ends the run
    Given the project allows 1 retry for each state
    And the test-writing agent writes no unit test in any attempt
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "skip_fr"
    Then the event log of the run records a transition from "TDD_RED" to "DONE" whose reason mentions "FR-CART-02", "skipped" and "the report names no unit test"
    And in the progress file of the worktree "FR-CART-02" is pending, with no cycle step and no scenarios
    And the run's branch has no commit since the start of the run
