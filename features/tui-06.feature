@FR-TUI-06
Feature: Notifications

  Background:
    Given a git project with a green suite
    And the project runs its BDD scenarios with cucumber and defines the steps of the scenario "Add to cart"
    And SPEC.md has the requirements "FR-CART-01" and "FR-CART-02"
    And progress.json records "FR-CART-01" as done with its passing scenario "Add to cart", and "FR-CART-02" as pending
    And the feature-writing agent writes for "FR-CART-02" the scenario "Add a line"
    And the step-writing agent writes the steps of "Add a line", and they fail because the cart code does not exist yet
    And the test-writing agent writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
    And the coding agent writes the cart code that passes the unit test and the scenario

  Scenario: A waiting run invokes the configured notification command with the question
    Given the project configuration sets "settings.notify_command" to "node notify.mjs"
    And "notify.mjs" records the values of "OID_EVENT" and "OID_MESSAGE"
    When I run "oid run --fr FR-CART-02" without a terminal
    Then the process exits with code 3
    And the notification command was run once
    And the notification received "OID_EVENT" as "waiting_input"
    And the notification received "OID_MESSAGE" describing the question about the feature files

  Scenario: A finished run invokes the configured notification command with the finished features
    Given the project configuration sets "settings.notify_command" to "node notify.mjs"
    And "notify.mjs" records the values of "OID_EVENT" and "OID_MESSAGE"
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the notification received "OID_EVENT" as "done"
    And the notification received "OID_MESSAGE" describing the finished feature "FR-CART-02"
    And the worktree has the commit for "FR-CART-02"
    And the event log of the run records a transition to "DONE"

  Scenario: A failed run invokes the configured notification command with the error
    Given the project configuration sets "settings.notify_command" to "node notify.mjs"
    And "notify.mjs" records the values of "OID_EVENT" and "OID_MESSAGE"
    And the project configuration sets "limits.max_retries" to 0
    And the test-writing agent writes no unit test
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the process exits with code 1
    And the notification received "OID_EVENT" as "error"
    And the notification received "OID_MESSAGE" describing "the report names no unit test"

  @wip
  Scenario: A run without a notification command invokes nothing
    When I run "oid run --fr FR-CART-02" without a terminal
    Then the process exits with code 3
    And no notification command was run

  Scenario: A notification command that fails does not stop a waiting run
    Given the project configuration sets "settings.notify_command" to "node notify.mjs"
    And "notify.mjs" exits with code 7
    When I run "oid run --fr FR-CART-02" without a terminal
    Then the process exits with code 3
    And the run is waiting for the human answer
    And the output warns that the notification command failed

  Scenario: A notification command that does not exist does not stop a finished run
    Given the project configuration sets "settings.notify_command" to "no-such-notifier"
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the event log of the run records a transition to "DONE"
    And the worktree has the commit for "FR-CART-02"
    And the output warns that the notification command could not be run
