@FR-INIT-03
Feature: oid init --import-progress writes nothing when the converted progress is invalid

  Background:
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {} }
      """

  Scenario: A converted progress with a feature id that is not an FR id leaves the project untouched
    Given a project file ".gitignore" containing:
      """
      dist/
      """
    And a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          { "id": "FR-1", "title": "Old thing", "status": "pending" }
        ]
      }
      """
    When I run "oid init --import-progress"
    Then the command fails
    And the error output contains "features[0].id"
    And the error output contains "FR-1"
    And no configuration file exists
    And the file ".gitignore" is unchanged
    And the progress file is unchanged

  Scenario: A converted progress with a feature without a title leaves the project untouched
    Given a project file ".gitignore" containing:
      """
      dist/
      """
    And a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          { "id": "FR-DEMO-01", "title": "Fine thing", "status": "blocked" },
          { "id": "FR-DEMO-02", "status": "pending" }
        ]
      }
      """
    When I run "oid init --import-progress"
    Then the command fails
    And the error output contains "features[1].title"
    And the error output contains "missing required field"
    And no configuration file exists
    And the file ".gitignore" is unchanged
    And the progress file is unchanged

  Scenario: No .gitignore is created when the converted progress is invalid
    Given a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          { "id": "FR-1", "title": "Old thing", "status": "pending" }
        ]
      }
      """
    When I run "oid init --import-progress"
    Then the command fails
    And no configuration file exists
    And no ".gitignore" file exists
    And the progress file is unchanged
