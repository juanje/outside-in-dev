@FR-RUN-10
Feature: Budget

  Background:
    Given a git project with a green suite
    And the project runs its BDD scenarios with cucumber and defines the steps of the scenario "Add to cart"
    And SPEC.md has the requirements "FR-CART-01" and "FR-CART-02"
    And progress.json records "FR-CART-01" as done with its passing scenario "Add to cart", and "FR-CART-02" as pending
    And the feature-writing agent writes for "FR-CART-02" the scenarios "Add a line" and "Remove a line"
    And the step-writing agent writes the steps of each scenario it is given, and they fail because the cart code does not exist yet

  Scenario: The cost of every agent session is added to the cost of the run and of the feature in the saved session
    Given the agents report a cost of 0.01 dollars and 1000 tokens for each session
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "abort"
    Then the saved session records the cost of the run as 0.01 dollars and 1000 tokens for each agent session that the event log shows started
    And the saved session records the same cost for "FR-CART-02"

  Scenario: A cost limit that is reached stops the run before the next agent call and asks to extend or abort
    Given the project limits the cost of the run to 0.05 dollars
    And the agents report a cost of 0.03 dollars and 1000 tokens for each session
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "abort"
    Then the human was asked once what to do about the budget, with the actions "extend" and "abort"
    And the question about the budget mentions "TDD_RED", "0.06" and "0.05"
    And the test-writing agent was not asked
    And the event log of the run records no "agent_start" of "TDD_RED"
    And the event log of the run records a transition from "TDD_RED" to "ABORTED"
    And the process exits with code 4
    And the worktree is kept

  Scenario: A cost limit for each feature stops the run when one feature has spent it, with no limit on the run
    Given the project limits the cost of each feature to 0.05 dollars
    And the agents report a cost of 0.03 dollars and 1000 tokens for each session
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "abort"
    Then the human was asked once what to do about the budget, with the actions "extend" and "abort"
    And the question about the budget mentions "FR-CART-02", "0.06" and "0.05"
    And the test-writing agent was not asked
    And the event log of the run records no "agent_start" of "TDD_RED"

  Scenario: Extending adds the cost limit once more and the run goes on with the call it stopped
    Given the project limits the cost of the run to 0.05 dollars
    And the agents report a cost of 0.03 dollars and 1000 tokens for each session
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve", "extend" and "abort"
    Then the human was asked once what to do about the budget, with the actions "extend" and "abort"
    And the test-writing agent was asked once
    And the saved session records the cost limit as extended once

  Scenario: A session that uses all its turns is stopped and the human is asked to extend or abort
    Given the project limits each agent session to 2 turns
    And the test-writing agent takes 3 turns before it finishes
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "abort"
    Then the human was asked once what to do about the budget, with the actions "extend" and "abort"
    And the question about the budget mentions "TDD_RED" and "2 turns"
    And the session of the test-writing agent was stopped
    And the event log of the run records a transition from "TDD_RED" to "ABORTED"
    And the worktree is kept

  Scenario: Extending after the turn limit runs the task again, from the last checkpoint, with room for as many more turns
    Given the project limits each agent session to 2 turns
    And the test-writing agent takes 3 turns before it finishes, then writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
    And the coding agent writes the cart code that passes the unit test and the scenario
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve", "extend" and "abort"
    Then the human was asked once what to do about the budget, with the actions "extend" and "abort"
    And the test-writing agent was asked twice, and its second session ran the whole task
    And the event log of the run records 2 "agent_start" of "TDD_RED", both with the attempt 1
    And the event log of the run records a transition from "TDD_RED" to "CODE_GREEN"

  Scenario: A session that outlasts its time limit is stopped and the human is asked to extend or abort
    Given the project limits each agent session to 1 second
    And the test-writing agent does not finish in its first session
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "abort"
    Then the human was asked once what to do about the budget, with the actions "extend" and "abort"
    And the question about the budget mentions "TDD_RED" and "1 s"
    And the session of the test-writing agent was stopped
    And the event log of the run records a transition from "TDD_RED" to "ABORTED"
