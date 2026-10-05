@FR-PROG-07
Feature: Report non-object entries in progress.json as schema violations

  Scenario: A progress file that is a list instead of an object is reported
    Given a progress file containing:
      """
      []
      """
    When I run "oid progress status"
    Then the command fails
    And the error output contains "wrong type (expected object)"
    And the progress file is unchanged

  Scenario: A progress file that is null is reported without a stack trace
    Given a progress file containing:
      """
      null
      """
    When I run "oid progress current"
    Then the command fails
    And the error output contains "wrong type (expected object)"
    And the error output does not contain "TypeError"
    And the progress file is unchanged

  Scenario: A feature entry that is not an object is reported with its path
    Given a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          42,
          { "id": "FR-X-01", "title": "Alpha", "status": "pending" }
        ]
      }
      """
    When I run "oid progress status"
    Then the command fails
    And the error output contains "features[0]"
    And the error output contains "wrong type (expected object)"
    And the error output does not contain "TypeError"
    And the progress file is unchanged

  Scenario: A scenario entry that is not an object is reported with its path
    Given a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          {
            "id": "FR-X-01",
            "title": "Alpha",
            "status": "in_progress",
            "cycle_step": "bdd_red",
            "scenarios": [ "Alpha works" ]
          }
        ]
      }
      """
    When I run "oid progress status"
    Then the command fails
    And the error output contains "features[0].scenarios[0]"
    And the error output contains "wrong type (expected object)"
    And the progress file is unchanged

  Scenario: A scenario name that is not a string is reported with its path
    Given a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          {
            "id": "FR-X-01",
            "title": "Alpha",
            "status": "in_progress",
            "cycle_step": "bdd_red",
            "scenarios": [ { "name": 5, "bdd": "pass" } ]
          }
        ]
      }
      """
    When I run "oid progress status"
    Then the command fails
    And the error output contains "features[0].scenarios[0].name"
    And the error output contains "wrong type (expected string)"
    And the progress file is unchanged

  Scenario: A scenarios field that is not a list is reported with its path
    Given a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          {
            "id": "FR-X-01",
            "title": "Alpha",
            "status": "in_progress",
            "cycle_step": "bdd_red",
            "scenarios": {}
          }
        ]
      }
      """
    When I run "oid progress status"
    Then the command fails
    And the error output contains "features[0].scenarios"
    And the error output contains "wrong type (expected array)"
    And the error output does not contain "TypeError"
    And the progress file is unchanged

  Scenario: The consistency check reports a non-object entry instead of crashing
    Given a SPEC.md containing:
      """
      ### FR-X-01: Alpha

      The tool does alpha.
      """
    And a progress file containing:
      """
      {
        "current_focus": null,
        "features": [ 42 ]
      }
      """
    When I run "oid check"
    Then the command fails
    And the output contains "features[0]"
    And the output contains "wrong type (expected object)"
    And the error output does not contain "TypeError"
