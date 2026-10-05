@FR-PROG-07
Feature: Reject an invalid progress file

  Scenario: An unknown field on a feature is reported with its path
    Given a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          { "id": "FR-X-01", "title": "Alpha", "status": "pending" },
          { "id": "FR-X-02", "title": "Beta", "status": "pending", "notes": "remember this" }
        ]
      }
      """
    When I run "oid progress status"
    Then the command fails
    And the error output contains "features[1].notes"
    And the error output contains "unknown field"
    And the progress file is unchanged

  Scenario: An unknown field at the top level is reported
    Given a progress file containing:
      """
      {
        "current_focus": null,
        "features": [],
        "comment": "free text"
      }
      """
    When I run "oid progress current"
    Then the command fails
    And the error output contains "comment"
    And the error output contains "unknown field"

  Scenario: A status outside the allowed values is reported
    Given a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          { "id": "FR-X-01", "title": "Alpha", "status": "blocked" }
        ]
      }
      """
    When I run "oid progress show FR-X-01"
    Then the command fails
    And the error output contains "features[0].status"
    And the error output contains "blocked"

  Scenario: A missing required field is reported
    Given a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          { "id": "FR-X-01", "status": "pending" }
        ]
      }
      """
    When I run "oid progress status"
    Then the command fails
    And the error output contains "features[0].title"
    And the error output contains "missing"

  Scenario: A value of the wrong type is reported
    Given a progress file containing:
      """
      {
        "current_focus": 7,
        "features": []
      }
      """
    When I run "oid progress current"
    Then the command fails
    And the error output contains "current_focus"
    And the error output contains "wrong type"

  Scenario: A scenario with an invalid status is reported with its path
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
            "scenarios": [ { "name": "Alpha works", "bdd": "green" } ]
          }
        ]
      }
      """
    When I run "oid progress status"
    Then the command fails
    And the error output contains "features[0].scenarios[0].bdd"

  Scenario: A pending feature with a cycle step is reported
    Given a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          { "id": "FR-X-01", "title": "Alpha", "status": "pending", "cycle_step": "select" }
        ]
      }
      """
    When I run "oid progress status"
    Then the command fails
    And the error output contains "features[0].cycle_step"

  Scenario: An in-progress feature without a cycle step is reported
    Given a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          { "id": "FR-X-01", "title": "Alpha", "status": "in_progress" }
        ]
      }
      """
    When I run "oid progress status"
    Then the command fails
    And the error output contains "features[0].cycle_step"

  Scenario: A done feature with a cycle step is reported
    Given a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          {
            "id": "FR-X-01",
            "title": "Alpha",
            "status": "done",
            "cycle_step": "quality_gate",
            "scenarios": [ { "name": "Alpha works", "bdd": "pass" } ]
          }
        ]
      }
      """
    When I run "oid progress status"
    Then the command fails
    And the error output contains "features[0].cycle_step"

  Scenario: A command that would change an invalid file is refused and leaves it untouched
    Given a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          { "id": "FR-X-01", "title": "Alpha", "status": "pending", "notes": "remember this" }
        ]
      }
      """
    When I run "oid progress focus FR-X-01"
    Then the command fails
    And the error output contains "features[0].notes"
    And the progress file is unchanged

  Scenario: A change that would make the file invalid is not written
    Given a SPEC.md defining the requirements "FR-X-02"
    And a tracked feature "FR-X-01" titled "Alpha"
    When I run "oid progress add FR-X-02 \"\""
    Then the command fails
    And the error output contains "features[1].title"
    And the progress file is unchanged
