@FR-PROG-06
Feature: Mark a feature done

  Scenario: A feature whose scenarios all pass is marked done
    Given a tracked feature "FR-X-01" with a scenario "Alpha works" marked "pass"
    And the started feature "FR-X-01" also has a scenario "Beta works" marked "pass"
    And the last green ran every scenario of "FR-X-01" that is marked "pass"
    When I run "oid progress done FR-X-01"
    Then the command succeeds
    And the feature "FR-X-01" has the status "done"
    And the feature "FR-X-01" has no cycle step
    And the feature "FR-X-01" has 2 scenarios

  Scenario: Marking the focused feature done clears the focus
    Given a tracked feature "FR-X-01" with a scenario "Alpha works" marked "pass"
    And the focus is on "FR-X-01"
    And the last green ran every scenario of "FR-X-01" that is marked "pass"
    When I run "oid progress done FR-X-01"
    Then the command succeeds
    And no feature is focused in the progress file

  Scenario: Marking another feature done keeps the focus
    Given a tracked feature "FR-X-01" with a scenario "Alpha works" marked "pass"
    And a tracked feature "FR-X-02" titled "Beta"
    And the focus is on "FR-X-02"
    And the last green ran every scenario of "FR-X-01" that is marked "pass"
    When I run "oid progress done FR-X-01"
    Then the command succeeds
    And the feature "FR-X-01" has the status "done"
    And the current focus is "FR-X-02"

  Scenario: A feature without scenarios is refused
    Given a started feature "FR-X-01" at step "select"
    When I run "oid progress done FR-X-01"
    Then the command fails
    And the error output contains "FR-X-01"
    And the progress file is unchanged

  Scenario: A feature with a scenario that does not pass is refused
    Given a tracked feature "FR-X-01" with a scenario "Alpha works" marked "pass"
    And the started feature "FR-X-01" also has a scenario "Beta works" marked "fail"
    And the started feature "FR-X-01" also has a scenario "Gamma works" marked "pending"
    When I run "oid progress done FR-X-01"
    Then the command fails
    And the error output contains "Beta works"
    And the error output contains "Gamma works"
    And the progress file is unchanged

  Scenario: A feature that is not tracked is refused
    Given a tracked feature "FR-X-01" with a scenario "Alpha works" marked "pass"
    When I run "oid progress done FR-X-99"
    Then the command fails
    And the error output contains "FR-X-99"
    And the progress file is unchanged
