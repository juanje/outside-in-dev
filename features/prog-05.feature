@FR-PROG-05
Feature: Record scenario status

  Scenario: The status of an existing scenario is updated
    Given a tracked feature "FR-X-01" with a scenario "Alpha works" marked "fail"
    When I run "oid progress scenario pass FR-X-01 \"Alpha works\""
    Then the command succeeds
    And the feature "FR-X-01" has the scenario "Alpha works" marked "pass"
    And the feature "FR-X-01" has 1 scenarios

  Scenario: A scenario that is not yet recorded is created
    Given a tracked feature "FR-X-01" with a scenario "Alpha works" marked "pass"
    When I run "oid progress scenario fail FR-X-01 \"Beta works\""
    Then the command succeeds
    And the feature "FR-X-01" has the scenario "Beta works" marked "fail"
    And the feature "FR-X-01" has the scenario "Alpha works" marked "pass"
    And the feature "FR-X-01" has 2 scenarios

  Scenario: A scenario can be set back to pending
    Given a tracked feature "FR-X-01" with a scenario "Alpha works" marked "fail"
    When I run "oid progress scenario pending FR-X-01 \"Alpha works\""
    Then the command succeeds
    And the feature "FR-X-01" has the scenario "Alpha works" marked "pending"

  Scenario: A status other than pass, fail or pending is refused
    Given a tracked feature "FR-X-01" with a scenario "Alpha works" marked "fail"
    When I run "oid progress scenario green FR-X-01 \"Alpha works\""
    Then the command fails
    And the error output contains "green"
    And the progress file is unchanged

  Scenario: A feature that is not tracked is refused
    Given a tracked feature "FR-X-01" with a scenario "Alpha works" marked "fail"
    When I run "oid progress scenario pass FR-X-99 \"Alpha works\""
    Then the command fails
    And the error output contains "FR-X-99"
    And the progress file is unchanged

  Scenario: A feature that has not started cannot hold scenarios
    Given a tracked feature "FR-X-01" titled "Alpha"
    When I run "oid progress scenario fail FR-X-01 \"Alpha works\""
    Then the command fails
    And the error output contains "FR-X-01"
    And the progress file is unchanged
