@FR-INIT-03
Feature: The import report says "scenario" for one and "scenarios" for several

  Background:
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {} }
      """

  Scenario: One dropped scenario of a pending feature is reported in the singular
    Given a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          { "id": "FR-DEMO-01", "title": "Later thing", "status": "blocked", "scenarios": [ { "name": "Only one", "bdd": "pending" } ] }
        ]
      }
      """
    When I run "oid init --import-progress"
    Then the command succeeds
    And the output contains "FR-DEMO-01: 1 scenario dropped"
    And the output does not contain "1 scenarios"

  Scenario: One scenario with a unit test count is reported in the singular
    Given a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          { "id": "FR-DEMO-01", "title": "Done thing", "status": "done", "scenarios": [ { "name": "Only one", "bdd": "pass", "unit_tests": 3 } ] }
        ]
      }
      """
    When I run "oid init --import-progress"
    Then the command succeeds
    And the output contains "unit_tests dropped from 1 scenario"
    And the output does not contain "1 scenarios"
