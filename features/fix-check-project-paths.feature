Feature: oid check and oid progress use the paths of .outside-in.json

  Background:
    Given a project configuration with the spec "specs/SPEC.md", the progress file "specs/progress.json" and the feature globs "specs/features/**/*.feature"

  @FR-CHECK-01
  Scenario: A requirement problem is reported against the configured spec file
    Given a project file "specs/SPEC.md" containing:
      """
      ### FR-DUP-01: Same title

      The tool does the same thing.

      ### FR-DUP-01: Same title

      The tool does the same thing.
      """
    When I run "oid check"
    Then the command fails
    And the output contains "specs/SPEC.md: FR-DUP-01: duplicate ID"
    And the output does not contain "SPEC.md not found"

  @FR-CHECK-02
  Scenario: Feature files are read from every configured glob
    Given a project file "specs/SPEC.md" containing:
      """
      ### FR-X-01: Alpha

      The tool does alpha.
      """
    And a project file "specs/features/chat/alpha.feature" containing:
      """
      @FR-X-99
      Feature: Alpha

        Scenario: Alpha works
          Given alpha
      """
    And a project file "extra/beta.feature" containing:
      """
      Feature: Beta

        Scenario: Beta works
          Given beta
      """
    And the project configuration also lists the feature glob "extra/*.feature"
    When I run "oid check"
    Then the command fails
    And the output contains "specs/features/chat/alpha.feature: Alpha works: unknown tag @FR-X-99"
    And the output contains "extra/beta.feature: Beta works: no @FR tag"

  @FR-CHECK-02
  Scenario: Feature files outside the configured globs are not read
    Given a project file "specs/SPEC.md" containing:
      """
      ### FR-X-01: Alpha

      The tool does alpha.
      """
    And a project file "features/stray.feature" containing:
      """
      Feature: Stray

        Scenario: Nobody traces this
          Given a stray
      """
    When I run "oid check"
    Then the command succeeds
    And the output contains "no violations"

  @FR-CHECK-03
  Scenario: Progress is read from the configured progress file
    Given a project file "specs/SPEC.md" containing:
      """
      ### FR-X-01: Alpha

      The tool does alpha.
      """
    And a project file "specs/features/alpha.feature" containing:
      """
      @FR-X-01
      Feature: Alpha

        Scenario: Alpha works
          Given alpha
      """
    And a project file "specs/progress.json" containing:
      """
      { "current_focus": null, "features": [ { "id": "FR-X-01", "title": "Alpha", "status": "done", "scenarios": [ { "name": "Alpha works", "bdd": "fail" } ] } ] }
      """
    When I run "oid check"
    Then the command fails
    And the output contains "specs/progress.json: FR-X-01: Alpha works: done but scenario is fail"
    And the output does not contain "progress.json not found"

  @FR-CHECK-04
  Scenario: A clean project with configured paths passes in the JSON report
    Given a project file "specs/SPEC.md" containing:
      """
      ### FR-X-01: Alpha

      The tool does alpha.
      """
    And a project file "specs/features/alpha.feature" containing:
      """
      @FR-X-01
      Feature: Alpha

        Scenario: Alpha works
          Given alpha
      """
    And a project file "specs/progress.json" containing:
      """
      { "current_focus": null, "features": [ { "id": "FR-X-01", "title": "Alpha", "status": "done", "scenarios": [ { "name": "Alpha works", "bdd": "pass" } ] } ] }
      """
    When I run "oid check --json"
    Then the command succeeds
    And the output is a single JSON document
    And the JSON report says ok is true

  @FR-CHECK-04
  Scenario: An invalid configuration is reported in the JSON document
    Given a project file ".outside-in.json" containing:
      """
      { "version": 2 }
      """
    When I run "oid check --json"
    Then the command fails
    And the output is a single JSON document
    And the JSON report says ok is false
    And the JSON report has a "config" violation containing ".outside-in.json is invalid"

  @FR-CHECK-04
  Scenario: An invalid configuration is reported by oid check
    Given a project file ".outside-in.json" containing:
      """
      { "version": 2 }
      """
    When I run "oid check"
    Then the command fails
    And the error output contains ".outside-in.json is invalid"
    And the error output contains "version"

  @FR-PROG-01
  Scenario: oid progress status reads the configured progress file
    Given a project file "specs/progress.json" containing:
      """
      { "current_focus": null, "features": [ { "id": "FR-X-01", "title": "Alpha", "status": "pending" } ] }
      """
    When I run "oid progress status"
    Then the command succeeds
    And the output contains "FR-X-01"

  @FR-PROG-02
  Scenario: oid progress add writes the configured progress file and checks the configured spec
    Given a project file "specs/SPEC.md" containing:
      """
      ### FR-X-01: Alpha

      The tool does alpha.
      """
    And a project file "specs/progress.json" containing:
      """
      { "current_focus": null, "features": [] }
      """
    When I run "oid progress add FR-X-01 Alpha"
    Then the command succeeds
    And the file "specs/progress.json" lists the features "FR-X-01"
    And no "progress.json" file exists

  @FR-PROG-02
  Scenario: oid progress add names the configured spec when the requirement is missing
    Given a project file "specs/SPEC.md" containing:
      """
      ### FR-X-01: Alpha

      The tool does alpha.
      """
    And a project file "specs/progress.json" containing:
      """
      { "current_focus": null, "features": [] }
      """
    When I run "oid progress add FR-X-02 Beta"
    Then the command fails
    And the error output contains "FR-X-02 is not defined in specs/SPEC.md"

  @FR-PROG-05
  Scenario: oid progress scenario records into the configured progress file
    Given a project file "specs/progress.json" containing:
      """
      { "current_focus": null, "features": [ { "id": "FR-X-01", "title": "Alpha", "status": "in_progress", "cycle_step": "bdd_red" } ] }
      """
    When I run "oid progress scenario fail FR-X-01 \"Alpha works\""
    Then the command succeeds
    And the file "specs/progress.json" contains "Alpha works"
    And no "progress.json" file exists

  @FR-PROG-07
  Scenario: An invalid progress file is reported with its configured path
    Given a project file "specs/progress.json" containing:
      """
      { "current_focus": null, "features": [ { "id": "FR-X-01", "title": "", "status": "pending" } ] }
      """
    When I run "oid progress status"
    Then the command fails
    And the error output contains "specs/progress.json is invalid"
    And the file "specs/progress.json" is unchanged

  @FR-PROG-01
  Scenario: oid progress with an invalid configuration fails naming the violation
    Given a project file ".outside-in.json" containing:
      """
      { "version": 2 }
      """
    When I run "oid progress status"
    Then the command fails
    And the error output contains ".outside-in.json is invalid"
