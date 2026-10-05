@FR-PROG-03
Feature: Focus a feature

  Scenario: Focusing a tracked feature sets the current focus
    Given a tracked feature "FR-X-01" titled "Alpha"
    And a tracked feature "FR-X-02" titled "Beta"
    And the focus is on "FR-X-01"
    When I run "oid progress focus FR-X-02"
    Then the command succeeds
    And the current focus is "FR-X-02"

  Scenario: Focusing does not change the status of the feature
    Given a tracked feature "FR-X-01" titled "Alpha"
    When I run "oid progress focus FR-X-01"
    Then the command succeeds
    And the current focus is "FR-X-01"
    And the feature "FR-X-01" has the status "pending"

  Scenario: Focusing a feature that is not tracked is refused
    Given a tracked feature "FR-X-01" titled "Alpha"
    And the focus is on "FR-X-01"
    When I run "oid progress focus FR-X-99"
    Then the command fails
    And the error output contains "FR-X-99"
    And the current focus is "FR-X-01"
    And the progress file is unchanged
