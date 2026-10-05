Feature: oid init finds the specification and the progress file where the project keeps them

  Background:
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {} }
      """

  @FR-INIT-01
  Scenario: A specification at the root keeps the root paths
    Given a project file "SPEC.md" containing:
      """
      ### FR-DEMO-01: Detect things

      Description.
      """
    When I run "oid init"
    Then the command succeeds
    And the configuration field "paths.spec" is "SPEC.md"
    And the configuration field "paths.progress" is "progress.json"
    And the configuration field "paths.design" is ["SPEC.md", "DOMAIN.md", "DECISIONS.md"]

  @FR-INIT-01
  Scenario: A specification found only in specs/ moves the progress file and the design documents there
    Given a project file "specs/SPEC.md" containing:
      """
      ### FR-DEMO-01: Detect things

      Description.
      """
    When I run "oid init"
    Then the command succeeds
    And the configuration field "paths.spec" is "specs/SPEC.md"
    And the configuration field "paths.progress" is "specs/progress.json"
    And the configuration field "paths.design" is ["specs/SPEC.md", "specs/DOMAIN.md", "specs/DECISIONS.md"]

  @FR-INIT-01
  Scenario: A specification at the root wins over one in specs/
    Given a project file "SPEC.md" containing:
      """
      ### FR-DEMO-01: Detect things

      Description.
      """
    And a project file "specs/SPEC.md" containing:
      """
      ### FR-DEMO-02: Report things

      Description.
      """
    When I run "oid init"
    Then the command succeeds
    And the configuration field "paths.spec" is "SPEC.md"
    And the configuration field "paths.progress" is "progress.json"

  @FR-INIT-01
  Scenario: Without any specification the paths stay at the root
    When I run "oid init"
    Then the command succeeds
    And the configuration field "paths.spec" is "SPEC.md"
    And the configuration field "paths.progress" is "progress.json"
    And the configuration field "paths.design" is ["SPEC.md", "DOMAIN.md", "DECISIONS.md"]

  @FR-INIT-02
  Scenario: The progress file is created beside a specification kept in specs/
    Given a project file "specs/SPEC.md" containing:
      """
      ### FR-DEMO-01: Detect things

      Description.

      ### FR-DEMO-02: Report things

      Description.
      """
    When I run "oid init"
    Then the command succeeds
    And the file "specs/progress.json" lists the features "FR-DEMO-01, FR-DEMO-02"
    And no "progress.json" file exists

  @FR-INIT-02
  Scenario: An existing progress file beside a specification kept in specs/ is left untouched
    Given a project file "specs/SPEC.md" containing:
      """
      ### FR-DEMO-01: Detect things

      Description.
      """
    And a project file "specs/progress.json" containing:
      """
      { "current_focus": null, "features": [] }
      """
    When I run "oid init"
    Then the command succeeds
    And the file "specs/progress.json" is unchanged
    And the output contains "specs/progress.json already exists"
    And no "progress.json" file exists

  @FR-INIT-02
  Scenario: A specification kept in specs/ that cannot become a progress file is named with its path
    Given a project file "specs/SPEC.md" containing:
      """
      ### FR-DEMO-01: Detect things

      Description.

      ### FR-DEMO-01: Detect things again

      Description.
      """
    When I run "oid init"
    Then the command fails
    And the error output contains "specs/SPEC.md cannot be turned into specs/progress.json"
    And no "specs/progress.json" file exists
    And no "progress.json" file exists
