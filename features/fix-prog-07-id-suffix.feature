Feature: FR ids may end in one lowercase letter

  @FR-PROG-02
  Scenario: A requirement with a one-letter suffix can be added as a feature
    Given a SPEC.md defining the requirements "FR-X-01, FR-X-01b"
    And a tracked feature "FR-X-01" titled "Alpha"
    When I run "oid progress add FR-X-01b \"Alpha part b\""
    Then the command succeeds
    And the progress file lists the features "FR-X-01, FR-X-01b"
    And the feature "FR-X-01b" has the status "pending"

  @FR-PROG-07
  Scenario: A progress file tracking an id with a one-letter suffix is valid
    Given a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          { "id": "FR-X-01b", "title": "Alpha part b", "status": "pending" }
        ]
      }
      """
    When I run "oid progress status"
    Then the command succeeds
    And the output contains "FR-X-01b"

  @FR-PROG-07
  Scenario: An id with an upper-case suffix is still rejected
    Given a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          { "id": "FR-X-01B", "title": "Alpha part b", "status": "pending" }
        ]
      }
      """
    When I run "oid progress status"
    Then the command fails
    And the error output contains "features[0].id"

  @FR-PROG-07
  Scenario: An id with a two-letter suffix is still rejected
    Given a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          { "id": "FR-X-01bc", "title": "Alpha part b", "status": "pending" }
        ]
      }
      """
    When I run "oid progress status"
    Then the command fails
    And the error output contains "features[0].id"

  @FR-CHECK-01
  Scenario: A duplicate requirement id with a one-letter suffix is reported
    Given a SPEC.md containing:
      """
      ### FR-X-01b: Alpha part b

      The tool does alpha b.

      ### FR-X-01b: Alpha part b again

      The tool does alpha b again.
      """
    When I run "oid check"
    Then the command fails
    And the output contains "FR-X-01b"
    And the output contains "duplicate"

  @FR-CHECK-02
  Scenario: A scenario tagged with an id with a one-letter suffix is traced to SPEC.md
    Given a SPEC.md containing:
      """
      ### FR-X-01b: Alpha part b

      The tool does alpha b.
      """
    And a feature file "features/alpha.feature" containing:
      """
      @FR-X-01b
      Feature: Alpha part b

        Scenario: Alpha b works
      """
    When I run "oid check"
    Then the command succeeds
    And the output contains "no violations"
