@FR-PROG-07
Feature: Reject unknown fields inside scenarios of progress.json

  Scenario: A scenario with an unknown field is rejected with its path
    Given a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          {
            "id": "FR-X-01",
            "title": "Login",
            "status": "in_progress",
            "cycle_step": "select",
            "scenarios": [
              { "name": "S1", "bdd": "pass", "note": "x" }
            ]
          }
        ]
      }
      """
    When I run "oid progress status"
    Then the command fails
    And the error output contains "features[0].scenarios[0].note: unknown field"
    And the progress file is unchanged

  Scenario: The consistency check reports a scenario with an unknown field as a progress violation
    Given a SPEC.md containing:
      """
      ### FR-X-01: Login

      The user can log in.
      """
    And a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          {
            "id": "FR-X-01",
            "title": "Login",
            "status": "in_progress",
            "cycle_step": "select",
            "scenarios": [
              { "name": "S1", "bdd": "pass", "note": "x" }
            ]
          }
        ]
      }
      """
    When I run "oid check"
    Then the command fails
    And the output contains "features[0].scenarios[0].note: unknown field"
