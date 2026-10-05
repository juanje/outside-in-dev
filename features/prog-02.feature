@FR-PROG-02
Feature: Add a feature

  Scenario: A specified requirement is added as a pending feature at the end
    Given a SPEC.md defining the requirements "FR-X-01, FR-X-02"
    And a tracked feature "FR-X-01" titled "Alpha"
    When I run "oid progress add FR-X-02 \"Beta feature\""
    Then the command succeeds
    And the progress file lists the features "FR-X-01, FR-X-02"
    And the feature "FR-X-02" has the title "Beta feature"
    And the feature "FR-X-02" has the status "pending"
    And the feature "FR-X-02" has no cycle step

  Scenario: A feature that is already tracked is refused
    Given a SPEC.md defining the requirements "FR-X-01"
    And a tracked feature "FR-X-01" titled "Alpha"
    When I run "oid progress add FR-X-01 \"Alpha again\""
    Then the command fails
    And the error output contains "FR-X-01"
    And the progress file is unchanged

  Scenario: A requirement missing from SPEC.md is refused
    Given a SPEC.md defining the requirements "FR-X-01"
    And a tracked feature "FR-X-01" titled "Alpha"
    When I run "oid progress add FR-X-99 \"Ghost\""
    Then the command fails
    And the error output contains "FR-X-99"
    And the error output contains "SPEC.md"
    And the progress file is unchanged
