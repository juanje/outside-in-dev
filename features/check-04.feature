@FR-CHECK-04
Feature: Machine-readable results

  Scenario: A SPEC.md violation makes the check fail
    Given a SPEC.md containing:
      """
      ### FR-X-01: Alpha
      """
    When I run "oid check"
    Then the output contains "FR-X-01"
    And the command fails

  Scenario: A traceability violation makes the check fail
    Given a SPEC.md containing:
      """
      ### FR-X-01: Alpha

      The tool does alpha.
      """
    And a feature file "features/alpha.feature" containing:
      """
      Feature: Alpha

        Scenario: Orphan alpha
      """
    When I run "oid check"
    Then the output contains "Orphan alpha"
    And the command fails

  Scenario: A progress violation makes the check fail
    Given a SPEC.md containing:
      """
      ### FR-X-01: Alpha

      The tool does alpha.
      """
    And a progress file containing:
      """
      {
        "current_focus": "FR-X-01",
        "features": [
          { "id": "FR-X-01", "title": "Alpha", "status": "pending" }
        ]
      }
      """
    When I run "oid check"
    Then the output contains "progress.json"
    And the command fails

  Scenario: A clean project passes and a violation then makes it fail
    Given a SPEC.md containing:
      """
      ### FR-X-01: Alpha

      The tool does alpha.
      """
    And a feature file "features/alpha.feature" containing:
      """
      @FR-X-01
      Feature: Alpha

        Scenario: Working alpha
      """
    When I run "oid check"
    Then the command succeeds
    And the output contains "no violations"
    Given a feature file "features/alpha.feature" containing:
      """
      Feature: Alpha

        Scenario: Working alpha
      """
    When I run "oid check"
    Then the output contains "Working alpha"
    And the command fails

  Scenario: The JSON report lists every violation with its kind
    Given a SPEC.md containing:
      """
      ### FR-X-01: Alpha

      ### FR-X-02: Beta

      The tool does beta.
      """
    And a feature file "features/beta.feature" containing:
      """
      Feature: Beta

        Scenario: Orphan beta
      """
    And a progress file containing:
      """
      {
        "current_focus": "FR-X-02",
        "features": [
          { "id": "FR-X-02", "title": "Beta", "status": "pending" }
        ]
      }
      """
    When I run "oid check --json"
    Then the output is a single JSON document
    And the JSON report says ok is false
    And the JSON report has a "spec" violation containing "FR-X-01"
    And the JSON report has a "traceability" violation containing "Orphan beta"
    And the JSON report has a "progress" violation containing "FR-X-02"
    And every JSON violation message is a line printed by "oid check"
    And the command fails

  Scenario: The JSON report of a clean project is ok and empty
    Given a SPEC.md containing:
      """
      ### FR-X-01: Alpha

      The tool does alpha.
      """
    And a feature file "features/alpha.feature" containing:
      """
      @FR-X-01
      Feature: Alpha

        Scenario: Working alpha
      """
    When I run "oid check --json"
    Then the output is a single JSON document
    And the JSON report says ok is true
    And the JSON report lists no violations
    And the command succeeds
