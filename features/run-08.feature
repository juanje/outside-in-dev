@FR-RUN-08
Feature: Retries and escalation

  Background:
    Given a git project with a green suite
    And the project runs its BDD scenarios with cucumber and defines the steps of the scenario "Add to cart"
    And SPEC.md has the requirements "FR-CART-01" and "FR-CART-02"
    And progress.json records "FR-CART-01" as done with its passing scenario "Add to cart", and "FR-CART-02" as pending
    And the feature-writing agent writes for "FR-CART-02" the scenarios "Add a line" and "Remove a line"
    And the step-writing agent writes the steps of each scenario it is given, and they fail because the cart code does not exist yet

  Scenario: A step file that is not a valid Red is retried from the last checkpoint, with the attempt number and the reason
    Given the project allows 2 retries for each state
    And the step-writing agent's first attempt writes steps where one step has no definition, and also a file "features/steps/stray.steps.ts"
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "abort"
    Then the event log of the run records an "agent_start" of "BDD_RED" with the attempt 1
    And the event log of the run records an "agent_start" of "BDD_RED" with the attempt 2
    And the second task of the step-writing agent includes "attempt 2" and "did not run (status UNDEFINED)"
    And the event log of the run records a transition from "BDD_RED" to "TDD_RED"
    And the worktree has the commit "oid: checkpoint FR-CART-02 BDD_RED Add a line" with the step definitions and the progress update
    And the worktree has no "features/steps/stray.steps.ts"

  Scenario: Each retry raises the reasoning level, and the last one uses the strongest model
    Given the project allows 2 retries for each state
    And the user's setup assigns the models "fake/fast", "fake/default" and "fake/strong"
    And the test-writing agent writes no unit test in any attempt
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "abort"
    Then the event log of the run records an "agent_start" of "TDD_RED" with the attempt 1, the model "fake/default" and the thinking level "medium"
    And the event log of the run records an "agent_start" of "TDD_RED" with the attempt 2, the model "fake/default" and the thinking level "high"
    And the event log of the run records an "agent_start" of "TDD_RED" with the attempt 3, the model "fake/strong" and the thinking level "high"
    And the event log of the run records no "agent_start" of "TDD_RED" with the attempt 4
    And the sessions of the test-writing agent were opened with "fake/default" at "medium", "fake/default" at "high" and "fake/strong" at "high"

  Scenario: A retry of Code Green starts without the code of the failed attempt
    Given the project allows 1 retry for each state
    And the test-writing agent writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
    And the coding agent's first attempt writes code that does not make the unit test pass, and also a file "src/stray.ts"
    And the coding agent's second attempt writes the cart code that passes the unit test and the scenario
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "abort"
    Then the event log of the run records an "agent_start" of "CODE_GREEN" with the attempt 1
    And the event log of the run records an "agent_start" of "CODE_GREEN" with the attempt 2
    And the second task of the coding agent includes "attempt 2" and "Code Green is not green"
    And the worktree has the commit "oid: checkpoint FR-CART-02 CODE_GREEN Add a line" with the cart code
    And the commit "oid: checkpoint FR-CART-02 CODE_GREEN Add a line" does not hold "src/stray.ts"
    And the worktree has no "src/stray.ts"

  Scenario: Errors that the fix of the quality gate leaves are fixed again, up to the retries, before the human is asked
    Given the project allows 1 retry for each state
    And the project lints its source with a linter that reports every TODO comment
    And the agents write for each of the two scenarios a failing unit test and the cart code that passes it and the scenario
    And the detectors find nothing
    And the coding agent leaves a TODO comment in the cart code of the second scenario, and leaves it when it is asked to fix the lint error
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "abort"
    Then the event log of the run records an "agent_start" of "QUALITY_FIX" with the attempt 1
    And the event log of the run records an "agent_start" of "QUALITY_FIX" with the attempt 2
    And the fourth task of the coding agent includes "attempt 2" and "no-todo"
    And the human was asked once what to do about the quality gate, with the actions "view", "edit" and "abort"
    And the event log of the run records a transition from "QUALITY_GATE" to "ABORTED"

  Scenario: When the retries run out, the run asks what to do with the reason of the last attempt
    Given the project allows 1 retry for each state
    And the test-writing agent writes no unit test in any attempt
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "abort"
    Then the human was asked once what to do with "Add a line", after 2 attempts of "TDD_RED", with the actions "retry", "rewrite", "skip_scenario", "skip_fr" and "abort"
    And the question about the attempts mentions "the report names no unit test"
    And the event log of the run records a transition from "TDD_RED" to "ABORTED"
    And the process exits with code 2
    And the worktree is kept

  Scenario: The human retries with a note, and the note goes to one more attempt on the strongest model
    Given the project allows 1 retry for each state
    And the user's setup assigns the models "fake/fast", "fake/default" and "fake/strong"
    And the test-writing agent writes no unit test in its first two attempts, then writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
    And the coding agent writes the cart code that passes the unit test and the scenario
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve", "retry" and "abort", and gives the note "write the test for countLines of src/lines.ts"
    Then the human was asked once what to do with "Add a line", after 2 attempts of "TDD_RED", with the actions "retry", "rewrite", "skip_scenario", "skip_fr" and "abort"
    And the event log of the run records an "agent_start" of "TDD_RED" with the attempt 3, the model "fake/strong" and the thinking level "high"
    And the third task of the test-writing agent includes "attempt 3" and "write the test for countLines of src/lines.ts"
    And the event log of the run records a transition from "TDD_RED" to "CODE_GREEN"

  Scenario: A project that configures models is refused before the run starts, and the error names oid setup
    Given the project's ".outside-in.json" has a "models" key
    When I run "oid run --fr FR-CART-02"
    Then the process exits with code 1
    And the error mentions "oid setup"
    And no worktree or branch was created
