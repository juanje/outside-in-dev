@FR-RUN-11
Feature: A blocked agent asks the human in every state that has an agent

  Background:
    Given a git project with a green suite
    And the project runs its BDD scenarios with cucumber and defines the steps of the scenario "Add to cart"
    And SPEC.md has the requirements "FR-CART-01" and "FR-CART-02"
    And progress.json records "FR-CART-01" as done with its passing scenario "Add to cart", and "FR-CART-02" as pending
    And the step-writing agent writes the steps of each scenario it is given, and they fail because the cart code does not exist yet

  Scenario: A blocked feature-writing agent puts its reason to the human, without the actions that need a scenario
    Given the feature-writing agent reports that it is blocked with the reason "FR-CART-02 contradicts FR-CART-03"
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "abort"
    Then the human was asked once what to do about the blocked agent of "FR-CART-02" at "FEATURE_WRITE", with the actions "retry", "skip_fr" and "abort"
    And the question about the blocked agent mentions "FR-CART-02 contradicts FR-CART-03"
    And the event log of the run records a transition from "FEATURE_WRITE" to "ABORTED"
    And the event log of the run records no error

  Scenario: The human retries a blocked feature-writing agent with a note, and the note goes to the next attempt
    Given the feature-writing agent reports that it is blocked in its first attempt with the reason "FR-CART-02 contradicts FR-CART-03", then writes for "FR-CART-02" the scenarios "Add a line" and "Remove a line"
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "retry" and then "approve", and gives the note "FR-CART-03 is out of scope here"
    Then the human was asked once what to do about the blocked agent of "FR-CART-02" at "FEATURE_WRITE", with the actions "retry", "skip_fr" and "abort"
    And the second task of the feature-writing agent includes "FR-CART-03 is out of scope here"
    And the event log of the run records a transition from "FEATURE_WRITE" to "FEATURE_REVIEW"
    And the event log of the run records no error mentioning "FR-CART-02 contradicts FR-CART-03"

  Scenario: Skipping the feature after a blocked feature-writing agent leaves it pending and ends the run
    Given the feature-writing agent reports that it is blocked with the reason "FR-CART-02 contradicts FR-CART-03"
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "skip_fr"
    Then the event log of the run records a transition from "FEATURE_WRITE" to "DONE" whose reason mentions "FR-CART-02", "skipped" and "FR-CART-02 contradicts FR-CART-03"
    And in the progress file of the worktree "FR-CART-02" is pending, with no cycle step and no scenarios
    And the worktree has no "features/FR-CART-02.feature"
    And the event log of the run records no error

  Scenario: A blocked agent that fixes a quality gate error puts its reason to the human, offering only what fits the gate
    Given the feature-writing agent writes for "FR-CART-02" the scenarios "Add a line" and "Remove a line"
    And the project lints its source with a linter that reports every TODO comment
    And the agents write for each of the two scenarios a failing unit test and the cart code that passes it and the scenario
    And the detectors find nothing
    And the coding agent leaves a TODO comment in the cart code of the second scenario, and reports that it is blocked with the reason "the TODO marks a gap in the spec" when it is asked to fix the lint error
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "abort"
    Then the human was asked once what to do about the blocked agent of "FR-CART-02" at "QUALITY_FIX", with the actions "retry", "skip_fr" and "abort"
    And the question about the blocked agent mentions "the TODO marks a gap in the spec"
    And the event log of the run records a transition from "QUALITY_FIX" to "ABORTED"
    And the event log of the run records no error

  Scenario: The human retries a blocked fix agent with a note, and the fix is accepted on the next attempt
    Given the feature-writing agent writes for "FR-CART-02" the scenarios "Add a line" and "Remove a line"
    And the project lints its source with a linter that reports every TODO comment
    And the agents write for each of the two scenarios a failing unit test and the cart code that passes it and the scenario
    And the detectors find nothing
    And the coding agent leaves a TODO comment in the cart code of the second scenario, reports that it is blocked with the reason "the TODO marks a gap in the spec" the first time it is asked to fix the lint error, and removes the comment the second time
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve", "retry" and "abort", and gives the note "the gap is closed, delete the comment"
    Then the human was asked once what to do about the blocked agent of "FR-CART-02" at "QUALITY_FIX", with the actions "retry", "skip_fr" and "abort"
    And the last task of the coding agent includes "the gap is closed, delete the comment"
    And the event log of the run records a transition from "QUALITY_FIX" to "QUALITY_GATE" whose reason mentions "fixed"
    And the event log of the run records a transition from "QUALITY_GATE" to "FR_COMMIT"
    And the event log of the run records no error

  Scenario: Skipping the feature after a blocked fix agent discards its changes and puts it back to pending
    Given the feature-writing agent writes for "FR-CART-02" the scenarios "Add a line" and "Remove a line"
    And the project lints its source with a linter that reports every TODO comment
    And the agents write for each of the two scenarios a failing unit test and the cart code that passes it and the scenario
    And the detectors find nothing
    And the coding agent leaves a TODO comment in the cart code of the second scenario, and reports that it is blocked with the reason "the TODO marks a gap in the spec" when it is asked to fix the lint error
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "skip_fr"
    Then the event log of the run records a transition from "QUALITY_FIX" to "DONE" whose reason mentions "FR-CART-02", "skipped" and "the TODO marks a gap in the spec"
    And in the progress file of the worktree "FR-CART-02" is pending, with no cycle step and no scenarios
    And the event log of the run records no error
