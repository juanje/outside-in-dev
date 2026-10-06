@FR-PROG-01
Feature: Show progress

  Scenario: Current shows the focused feature with its scenarios
    Given a tracked feature "FR-X-01" with a scenario "Alpha works" marked "fail"
    And the started feature "FR-X-01" also has a scenario "Beta works" marked "pending"
    And the focus is on "FR-X-01"
    When I run "oid progress current"
    Then the command succeeds
    And the output contains "FR-X-01"
    And the output contains "in_progress"
    And the output contains "bdd_red"
    And the output contains "Alpha works"
    And the output contains "Beta works"

  Scenario: Current says so when no feature is focused
    Given a tracked feature "FR-X-01" titled "Alpha"
    And no feature is focused
    When I run "oid progress current"
    Then the command succeeds
    And the output contains "No feature is focused"

  Scenario: Status lists every tracked feature
    Given a tracked feature "FR-X-01" titled "Alpha"
    And a tracked feature "FR-X-02" with a scenario "Beta works" marked "pass"
    And the focus is on "FR-X-02"
    When I run "oid progress status --all"
    Then the command succeeds
    And the output contains "FR-X-01"
    And the output contains "Alpha"
    And the output contains "pending"
    And the output contains "FR-X-02"
    And the output contains "in_progress"
    And the output contains "bdd_red"

  Scenario: Show prints one feature with its scenarios and their status
    Given a tracked feature "FR-X-01" with a scenario "Alpha works" marked "fail"
    And a tracked feature "FR-X-02" titled "Other"
    When I run "oid progress show FR-X-01"
    Then the command succeeds
    And the output contains "FR-X-01"
    And the output contains "Alpha works"
    And the output contains "fail"
    And the output does not contain "FR-X-02"

  Scenario: Show fails for a feature that is not tracked
    Given a tracked feature "FR-X-01" titled "Alpha"
    When I run "oid progress show FR-X-99"
    Then the command fails
    And the error output contains "FR-X-99"

  Scenario: A missing progress file is reported
    When I run "oid progress status"
    Then the command fails
    And the error output contains "progress.json"
