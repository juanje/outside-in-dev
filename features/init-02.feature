@FR-INIT-02
Feature: Initialise progress from SPEC.md

  Background:
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {} }
      """

  Scenario: Every requirement of SPEC.md becomes a pending feature, in specification order
    Given a project file "SPEC.md" containing:
      """
      # Spec

      ### NFR-01: Speed

      Commands answer quickly.

      ### FR-DEMO-02: Second in the file but first by number

      Description.

      ### FR-DEMO-01: Detect things

      Description.

      ### FR-DEMO-03b: Suffixed id

      Description.
      """
    When I run "oid init"
    Then the command succeeds
    And the progress file lists the features "FR-DEMO-02, FR-DEMO-01, FR-DEMO-03b"
    And the feature "FR-DEMO-02" has the status "pending"
    And the feature "FR-DEMO-01" has the status "pending"
    And the feature "FR-DEMO-03b" has the status "pending"
    And no feature is focused in the progress file

  Scenario: Titles are the heading text as written
    Given a project file "SPEC.md" containing:
      """
      ### FR-DEMO-01: Initialise progress from [SPEC.md](http://SPEC.md)

      Description.
      """
    When I run "oid init"
    Then the feature "FR-DEMO-01" has the title "Initialise progress from [SPEC.md](http://SPEC.md)"

  Scenario: An existing progress file is left untouched
    Given a project file "SPEC.md" containing:
      """
      ### FR-DEMO-01: Detect things

      Description.

      ### FR-DEMO-02: Report things

      Description.
      """
    And a progress file containing:
      """
      { "current_focus": null, "features": [ { "id": "FR-DEMO-01", "title": "Detect things", "status": "pending" } ] }
      """
    When I run "oid init"
    Then the command succeeds
    And the progress file is unchanged
    And the output contains "progress.json already exists"

  Scenario: Without a SPEC.md no progress file is created
    When I run "oid init"
    Then the command succeeds
    And the output contains "SPEC.md not found"
    And no "progress.json" file exists
    And the configuration field "stack" is "typescript"

  Scenario: A duplicate requirement id prevents the progress file
    Given a project file "SPEC.md" containing:
      """
      ### FR-DEMO-01: Detect things

      Description.

      ### FR-DEMO-01: Detect things again

      Description.
      """
    When I run "oid init"
    Then the command fails
    And the error output contains "FR-DEMO-01"
    And the error output contains "duplicate"
    And the error output contains ".outside-in.json was written"
    And no "progress.json" file exists
    And the configuration field "stack" is "typescript"

  Scenario: An empty requirement title prevents the progress file
    Given a project file "SPEC.md" containing:
      """
      ### FR-DEMO-01:

      Description.
      """
    When I run "oid init"
    Then the command fails
    And the error output contains "FR-DEMO-01"
    And the error output contains "empty title"
    And the error output contains ".outside-in.json was written"
    And no "progress.json" file exists
    And the configuration field "stack" is "typescript"
