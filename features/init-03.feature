@FR-INIT-03
Feature: Import progress from another schema

  Background:
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {} }
      """

  Scenario: Blocked and deferred features become pending and are listed
    Given a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          { "id": "FR-DEMO-01", "title": "Done thing", "status": "done", "cycle_step": "done", "scenarios": [ { "name": "It works", "bdd": "pass", "unit_tests": 2 } ] },
          { "id": "FR-DEMO-02", "title": "Waiting thing", "status": "blocked", "cycle_step": "select", "scenarios": [] },
          { "id": "FR-DEMO-03", "title": "Later thing", "status": "deferred", "cycle_step": "select", "scenarios": [] },
          { "id": "FR-DEMO-04", "title": "Next thing", "status": "pending", "scenarios": [] }
        ]
      }
      """
    When I run "oid init --import-progress"
    Then the command succeeds
    And the feature "FR-DEMO-01" has the status "done"
    And the feature "FR-DEMO-02" has the status "pending"
    And the feature "FR-DEMO-03" has the status "pending"
    And the feature "FR-DEMO-04" has the status "pending"
    And the output contains "FR-DEMO-02: status blocked converted to pending"
    And the output contains "FR-DEMO-03: status deferred converted to pending"
    And the output does not contain "FR-DEMO-01:"
    And the output does not contain "FR-DEMO-04:"
    And the configuration field "stack" is "typescript"

  Scenario: The cycle step of an in-progress feature is carried over or converted
    Given a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          { "id": "FR-DEMO-01", "title": "Red thing", "status": "in_progress", "cycle_step": "bdd_red", "scenarios": [ { "name": "Red one", "bdd": "fail" } ] },
          { "id": "FR-DEMO-02", "title": "Reviewed thing", "status": "in_progress", "cycle_step": "spec_review", "scenarios": [] },
          { "id": "FR-DEMO-03", "title": "Implementing thing", "status": "in_progress", "cycle_step": "implementing", "scenarios": [] },
          { "id": "FR-DEMO-04", "title": "Green thing", "status": "in_progress", "cycle_step": "bdd_green", "scenarios": [] },
          { "id": "FR-DEMO-05", "title": "Odd thing", "status": "in_progress", "cycle_step": "polishing", "scenarios": [] }
        ]
      }
      """
    When I run "oid init --import-progress"
    Then the command succeeds
    And the feature "FR-DEMO-01" has the cycle step "bdd_red"
    And the feature "FR-DEMO-02" has the cycle step "select"
    And the feature "FR-DEMO-03" has the cycle step "tdd_red"
    And the feature "FR-DEMO-04" has the cycle step "quality_gate"
    And the feature "FR-DEMO-05" has the cycle step "select"
    And the feature "FR-DEMO-01" has the scenario "Red one" marked "fail"
    And the output contains "FR-DEMO-02: cycle_step spec_review converted to select"
    And the output contains "FR-DEMO-03: cycle_step implementing converted to tdd_red"
    And the output contains "FR-DEMO-04: cycle_step bdd_green converted to quality_gate"
    And the output contains "FR-DEMO-05: cycle_step polishing converted to select"
    And the output does not contain "FR-DEMO-01"

  Scenario: Done features lose their cycle step silently unless it was something else
    Given a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          { "id": "FR-DEMO-01", "title": "Plain done", "status": "done", "cycle_step": "done", "scenarios": [ { "name": "It works", "bdd": "pass" } ] },
          { "id": "FR-DEMO-02", "title": "Odd done", "status": "done", "cycle_step": "bdd_green", "scenarios": [ { "name": "It works too", "bdd": "pass" } ] }
        ]
      }
      """
    When I run "oid init --import-progress"
    Then the command succeeds
    And the feature "FR-DEMO-01" has no cycle step
    And the feature "FR-DEMO-02" has no cycle step
    And the feature "FR-DEMO-01" has the scenario "It works" marked "pass"
    And the feature "FR-DEMO-02" has the scenario "It works too" marked "pass"
    And the output contains "FR-DEMO-02: cycle_step bdd_green dropped"
    And the output does not contain "FR-DEMO-01"

  Scenario: Pending features lose their cycle step and scenarios, which are listed
    Given a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          { "id": "FR-DEMO-01", "title": "Reviewed thing", "status": "pending", "cycle_step": "spec_review", "scenarios": [] },
          { "id": "FR-DEMO-02", "title": "Planned thing", "status": "pending", "cycle_step": "select", "scenarios": [ { "name": "First", "bdd": "pending" }, { "name": "Second", "bdd": "pending" } ] },
          { "id": "FR-DEMO-03", "title": "Untouched thing", "status": "pending", "scenarios": [] }
        ]
      }
      """
    When I run "oid init --import-progress"
    Then the command succeeds
    And the feature "FR-DEMO-01" has the status "pending"
    And the feature "FR-DEMO-01" has no cycle step
    And the feature "FR-DEMO-02" has no cycle step
    And the feature "FR-DEMO-02" has 0 scenarios
    And the feature "FR-DEMO-01" has no field "scenarios"
    And the feature "FR-DEMO-03" has no field "scenarios"
    And the output contains "FR-DEMO-01: cycle_step spec_review dropped"
    And the output contains "FR-DEMO-02: cycle_step select dropped"
    And the output contains "FR-DEMO-02: 2 scenarios dropped"
    And the output does not contain "FR-DEMO-03"

  Scenario: Unit test counts are dropped and counted once, other scenario fields are listed
    Given a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          { "id": "FR-DEMO-01", "title": "First", "status": "done", "cycle_step": "done", "scenarios": [ { "name": "One", "bdd": "pass", "unit_tests": 2 }, { "name": "Two", "bdd": "pass", "unit_tests": 1 } ] },
          { "id": "FR-DEMO-02", "title": "Second", "status": "done", "cycle_step": "done", "scenarios": [ { "name": "Three", "bdd": "pass", "unit_tests": 4, "owner": "juan" } ] }
        ]
      }
      """
    When I run "oid init --import-progress"
    Then the command succeeds
    And the feature "FR-DEMO-01" has the scenario "One" marked "pass"
    And the scenario "Two" of the feature "FR-DEMO-01" has no field "unit_tests"
    And the scenario "Three" of the feature "FR-DEMO-02" has no field "unit_tests"
    And the scenario "Three" of the feature "FR-DEMO-02" has no field "owner"
    And the output contains "unit_tests dropped from 3 scenarios"
    And the output contains "FR-DEMO-02, scenario Three: owner juan dropped"

  Scenario: Fields the article does not define are dropped and listed with their value
    Given a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          { "id": "FR-DEMO-01", "title": "Noted", "status": "done", "cycle_step": "done", "note": "see FR-DEMO-02", "scenarios": [ { "name": "It works", "bdd": "pass" } ] },
          { "id": "FR-DEMO-02", "title": "Plain", "status": "done", "cycle_step": "done", "scenarios": [ { "name": "It also works", "bdd": "pass" } ] }
        ]
      }
      """
    When I run "oid init --import-progress"
    Then the command succeeds
    And the feature "FR-DEMO-01" has no field "note"
    And the output contains "FR-DEMO-01: note see FR-DEMO-02 dropped"
    And the output does not contain "FR-DEMO-02:"

  Scenario: The focus is kept when it points to an in-progress feature
    Given a progress file containing:
      """
      {
        "current_focus": "FR-DEMO-01",
        "features": [
          { "id": "FR-DEMO-01", "title": "Working", "status": "in_progress", "cycle_step": "implementing", "scenarios": [ { "name": "Red one", "bdd": "fail" } ] }
        ]
      }
      """
    When I run "oid init --import-progress"
    Then the command succeeds
    And the current focus is "FR-DEMO-01"
    And the feature "FR-DEMO-01" has the cycle step "tdd_red"
    And the output does not contain "current_focus"

  Scenario: The focus is cleared when its feature is no longer in progress
    Given a progress file containing:
      """
      {
        "current_focus": "FR-DEMO-01",
        "features": [
          { "id": "FR-DEMO-01", "title": "Stuck", "status": "blocked", "cycle_step": "select", "scenarios": [] }
        ]
      }
      """
    When I run "oid init --import-progress"
    Then the command succeeds
    And no feature is focused in the progress file
    And the output contains "current_focus FR-DEMO-01 reset to null"

  Scenario: A progress file already in the current schema is left unchanged
    Given a progress file containing:
      """
      { "current_focus": "FR-DEMO-01", "features": [ { "id": "FR-DEMO-01", "title": "Working", "status": "in_progress", "cycle_step": "select", "scenarios": [] }, { "id": "FR-DEMO-02", "title": "Waiting", "status": "pending" } ] }
      """
    When I run "oid init --import-progress"
    Then the command succeeds
    And the progress file is unchanged
    And the output contains "already in the current schema"
    And the configuration field "stack" is "typescript"

  Scenario: Importing without a progress file is an error and writes nothing
    When I run "oid init --import-progress"
    Then the command fails
    And the error output contains "progress.json not found"
    And no "progress.json" file exists
    And no configuration file exists
    And no ".gitignore" file exists

  Scenario: Ids are not checked against SPEC.md and the progress file is not rebuilt from it
    Given a project file "SPEC.md" containing:
      """
      ### FR-DEMO-09: Only in the spec

      Description.
      """
    And a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          { "id": "FR-OLD-01", "title": "Not in the spec", "status": "done", "cycle_step": "done", "scenarios": [ { "name": "It works", "bdd": "pass" } ] }
        ]
      }
      """
    When I run "oid init --import-progress"
    Then the command succeeds
    And the progress file lists the features "FR-OLD-01"
    And the feature "FR-OLD-01" has the status "done"
    And the feature "FR-OLD-01" has no cycle step
