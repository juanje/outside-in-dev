Feature: Undo a pending scenario and clear the focus

  @FR-PROG-05
  Scenario: A pending scenario is dropped
    Given a tracked feature "FR-X-01" with a scenario "Alpha works" marked "pending"
    And the started feature "FR-X-01" also has a scenario "Beta works" marked "fail"
    When I run "oid progress scenario drop FR-X-01 \"Alpha works\""
    Then the command succeeds
    And the feature "FR-X-01" has 1 scenarios
    And the feature "FR-X-01" has the scenario "Beta works" marked "fail"

  @FR-PROG-05
  Scenario Outline: A scenario that is not pending is not dropped
    Given a tracked feature "FR-X-01" with a scenario "Alpha works" marked "<status>"
    When I run "oid progress scenario drop FR-X-01 \"Alpha works\""
    Then the command fails
    And the error output contains "\"Alpha works\" is <status>"
    And the progress file is unchanged

    Examples:
      | status |
      | pass   |
      | fail   |

  @FR-PROG-05
  Scenario: Dropping a scenario the feature does not have is refused
    Given a tracked feature "FR-X-01" with a scenario "Alpha works" marked "pending"
    When I run "oid progress scenario drop FR-X-01 \"Gamma works\""
    Then the command fails
    And the error output contains "\"Gamma works\""
    And the progress file is unchanged

  @FR-PROG-03
  Scenario: Unfocusing clears the focus
    Given a tracked feature "FR-X-01" with a scenario "Alpha works" marked "pending"
    And the focus is on "FR-X-01"
    When I run "oid progress unfocus"
    Then the command succeeds
    And no feature is focused in the progress file
    And the feature "FR-X-01" has the status "in_progress"

  @FR-PROG-03
  Scenario: Unfocusing clears a focus on a feature that is already done
    Given a completed feature "FR-X-01"
    And the focus is on "FR-X-01"
    When I run "oid progress unfocus"
    Then the command succeeds
    And no feature is focused in the progress file
    And the feature "FR-X-01" has the status "done"
