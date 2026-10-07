@FR-TUI-03
Feature: Plain output without a terminal

  Background:
    Given a git project with ".outside-in/"
    And a run "run-1" whose output is not a terminal

  Scenario: A state change is printed as one line
    When oid emits a state change from "BDD_RED" to "TDD_RED" because "scenario is red" for "FR-CART-01"
    Then oid prints exactly one line
    And the line mentions "BDD_RED", "TDD_RED", "FR-CART-01" and "scenario is red"

  Scenario: An error is printed as one line
    When oid emits the error "agent timed out"
    Then oid prints exactly one line
    And the line mentions "error" and "agent timed out"

  Scenario: A message that spans several lines is still printed as one line
    When oid emits the error "agent timed out" with a detail of two lines, "first line" and "second line"
    Then oid prints exactly one line
    And the line mentions "agent timed out", "first line" and "second line"

  Scenario: Events are printed in the order they happen
    When oid emits a state change from "BDD_RED" to "TDD_RED" because "scenario is red" for "FR-CART-01"
    And oid emits the error "agent timed out"
    Then oid prints 2 lines
    And the first line mentions "TDD_RED"
    And the second line mentions "agent timed out"

  Scenario: Every event is also written to the run's event log
    When oid emits a state change from "BDD_RED" to "TDD_RED" because "scenario is red" for "FR-CART-01"
    And oid emits the error "agent timed out"
    Then ".outside-in/runs/run-1/events.jsonl" has 2 lines
    And each line of the event log is a JSON event of the run "run-1" with a timestamp
    And the event log records a "state_change" and then an "error"

  Scenario: A question with no terminal to answer it ends the process waiting for input
    When oid emits a question "Accept the ambiguous Red?" with the actions "approve" and "reject"
    Then oid prints a line with the question "Accept the ambiguous Red?"
    And the line mentions the actions "approve" and "reject"
    And the process exits with code 3

  Scenario: A question with no terminal saves the session so it can be resumed
    When oid emits a question "Accept the ambiguous Red?" with the actions "approve" and "reject"
    Then ".outside-in/session.json" is valid JSON
    And the session records the run "run-1"
    And the session's pending input is the question "Accept the ambiguous Red?" with the actions "approve" and "reject"
    And no temporary session file is left in ".outside-in/"

  Scenario: A question replaces the pending input of an earlier session
    Given a saved session of the run "run-1" with no pending input and the state "CODE_GREEN"
    When oid emits a question "Accept the ambiguous Red?" with the actions "approve" and "reject"
    Then the session's pending input is the question "Accept the ambiguous Red?" with the actions "approve" and "reject"
    And the session still has the state "CODE_GREEN"

  Scenario: A question is also written to the event log
    When oid emits a question "Accept the ambiguous Red?" with the actions "approve" and "reject"
    Then the event log records a "waiting_input"
