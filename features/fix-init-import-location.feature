@FR-INIT-03
Feature: oid init --import-progress reads the progress file where it is and keeps it beside the specification

  Background:
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {} }
      """

  Scenario: A progress file in specs/ is found and converted in place
    Given a project file "specs/SPEC.md" containing:
      """
      ### FR-DEMO-01: Old thing

      Description.
      """
    And a project file "specs/progress.json" containing:
      """
      { "current_focus": null, "features": [ { "id": "FR-DEMO-01", "title": "Old thing", "status": "blocked", "scenarios": [] } ] }
      """
    When I run "oid init --import-progress"
    Then the command succeeds
    And the file "specs/progress.json" lists the features "FR-DEMO-01"
    And the output contains "FR-DEMO-01: status blocked converted to pending"
    And no "progress.json" file exists

  Scenario: A progress file at the root is moved beside a specification kept in specs/
    Given a project file "specs/SPEC.md" containing:
      """
      ### FR-DEMO-01: Old thing

      Description.
      """
    And a project file "progress.json" containing:
      """
      { "current_focus": null, "features": [ { "id": "FR-DEMO-01", "title": "Old thing", "status": "blocked", "scenarios": [] } ] }
      """
    When I run "oid init --import-progress"
    Then the command succeeds
    And the file "specs/progress.json" lists the features "FR-DEMO-01"
    And no "progress.json" file exists
    And the output contains "progress read from progress.json and written to specs/progress.json; progress.json was removed"
    And the output contains "FR-DEMO-01: status blocked converted to pending"

  Scenario: A progress file in specs/ is moved to the root beside a specification kept there
    Given a project file "SPEC.md" containing:
      """
      ### FR-DEMO-01: Old thing

      Description.
      """
    And a project file "specs/progress.json" containing:
      """
      { "current_focus": null, "features": [ { "id": "FR-DEMO-01", "title": "Old thing", "status": "blocked", "scenarios": [] } ] }
      """
    When I run "oid init --import-progress"
    Then the command succeeds
    And the file "progress.json" lists the features "FR-DEMO-01"
    And no "specs/progress.json" file exists
    And the output contains "progress read from specs/progress.json and written to progress.json; specs/progress.json was removed"

  Scenario: A progress file given as an argument is read from there and moved beside the specification
    Given a project file "old/progress.json" containing:
      """
      { "current_focus": null, "features": [ { "id": "FR-DEMO-01", "title": "Old thing", "status": "blocked", "scenarios": [] } ] }
      """
    When I run "oid init --import-progress old/progress.json"
    Then the command succeeds
    And the file "progress.json" lists the features "FR-DEMO-01"
    And no "old/progress.json" file exists
    And the output contains "progress read from old/progress.json and written to progress.json; old/progress.json was removed"

  Scenario: A progress file already in the current schema is moved the same way
    Given a project file "specs/SPEC.md" containing:
      """
      ### FR-DEMO-01: Current thing

      Description.
      """
    And a project file "progress.json" containing:
      """
      { "current_focus": null, "features": [ { "id": "FR-DEMO-01", "title": "Current thing", "status": "pending" } ] }
      """
    When I run "oid init --import-progress"
    Then the command succeeds
    And the file "specs/progress.json" lists the features "FR-DEMO-01"
    And no "progress.json" file exists
    And the output contains "already in the current schema"
    And the output contains "progress read from progress.json and written to specs/progress.json; progress.json was removed"

  Scenario: An existing progress file at the destination that is not the source stops everything
    Given a project file "specs/SPEC.md" containing:
      """
      ### FR-DEMO-01: Old thing

      Description.
      """
    And a project file "progress.json" containing:
      """
      { "current_focus": null, "features": [ { "id": "FR-DEMO-01", "title": "Old thing", "status": "blocked", "scenarios": [] } ] }
      """
    And a project file "specs/progress.json" containing:
      """
      { "current_focus": null, "features": [] }
      """
    When I run "oid init --import-progress"
    Then the command fails
    And the error output contains "specs/progress.json already exists"
    And the file "progress.json" is unchanged
    And the file "specs/progress.json" is unchanged
    And no configuration file exists
    And no ".gitignore" file exists

  Scenario: Without a progress file anywhere the error names the places looked at
    When I run "oid init --import-progress"
    Then the command fails
    And the error output contains "progress.json not found"
    And the error output contains "specs/progress.json"
    And no configuration file exists
    And no ".gitignore" file exists

  Scenario: A progress file given as an argument that does not exist is an error
    When I run "oid init --import-progress old/progress.json"
    Then the command fails
    And the error output contains "old/progress.json not found"
    And no configuration file exists
    And no ".gitignore" file exists
