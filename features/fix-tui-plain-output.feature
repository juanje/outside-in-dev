@FR-TUI-03
Feature: Plain output stays one line per event, and a broken or foreign session is never merged

  Background:
    Given a git project with ".outside-in/"
    And a run "run-1" whose output is not a terminal

  Scenario: A reason that spans several lines is still printed as one line
    When oid emits a state change from "BDD_RED" to "TDD_RED" for "FR-CART-01" because of a reason of two lines, "first line" and "second line"
    Then oid prints exactly one line
    And the line mentions "TDD_RED", "first line" and "second line"

  Scenario: A question that spans several lines is still printed as one line
    When oid emits a question of two lines, "Accept this failure?" and "expected 1 but got 2", with the actions "approve" and "reject"
    Then oid prints exactly one line
    And the line mentions "Accept this failure?", "expected 1 but got 2" and "approve"
    And the process exits with code 3

  Scenario: An error message that spans several lines is still printed as one line
    When oid emits an error message of two lines, "agent timed out" and "after 30 seconds"
    Then oid prints exactly one line
    And the line mentions "agent timed out" and "after 30 seconds"

  Scenario: Windows line endings are printed as one line
    When oid emits the error "agent timed out" with a detail of two lines, "first line" and "second line", separated by a Windows line ending
    Then oid prints exactly one line
    And the printed line contains no line break of any kind
    And the line mentions "agent timed out", "first line" and "second line"

  Scenario Outline: A question while the session file is unusable is an error, and the file is left alone
    Given the session file ".outside-in/session.json" contains <content>
    When oid emits a question "Accept the ambiguous Red?" with the actions "approve" and "reject"
    Then oid prints 2 lines
    And the first line is the question "Accept the ambiguous Red?"
    And the second line mentions "error" and ".outside-in/session.json"
    And the output shows no stack trace
    And the process exits with code 1
    And ".outside-in/session.json" still contains <content>
    And the event log records a "waiting_input" and then an "error"

    Examples:
      | content      |
      | "{not json"  |
      | "[1, 2]"     |
      | "null"       |

  Scenario: A question of another run does not inherit the session of an earlier run
    Given a saved session of the run "run-1" with the state "CODE_GREEN", the worktree "/work/run-1" and the target "FR-CART-01"
    And a run "run-2" whose output is not a terminal
    When oid emits a question "Accept the ambiguous Red?" with the actions "approve" and "reject"
    Then the session records the run "run-2"
    And the session's pending input is the question "Accept the ambiguous Red?" with the actions "approve" and "reject"
    And the session has no state, no worktree and no target features
