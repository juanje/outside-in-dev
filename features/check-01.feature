@FR-CHECK-01
Feature: Validate SPEC.md

  Scenario: A clean SPEC.md reports no violations
    Given a SPEC.md containing:
      """
      # Spec

      ## Requirements

      ### FR-X-01: Alpha

      The tool does alpha.

      ### FR-X-02: Beta

      The tool does beta.
      """
    When I run "oid check"
    Then the output contains "no violations"

  Scenario: A duplicate requirement ID is reported
    Given a SPEC.md containing:
      """
      ### FR-X-01: Alpha

      The tool does alpha.

      ### FR-X-01: Alpha again

      The tool does alpha twice.
      """
    When I run "oid check"
    Then the output contains "FR-X-01"
    And the output contains "duplicate"
    And the output does not contain "no violations"

  Scenario: A requirement with an empty title is reported
    Given a SPEC.md containing:
      """
      ### FR-X-01:

      The tool does alpha.
      """
    When I run "oid check"
    Then the output contains "FR-X-01"
    And the output contains "empty title"

  Scenario: A requirement with an empty body is reported
    Given a SPEC.md containing:
      """
      ### FR-X-01: Alpha

      ### FR-X-02: Beta

      The tool does beta.
      """
    When I run "oid check"
    Then the output contains "FR-X-01"
    And the output contains "empty body"
    And the output does not contain "FR-X-02"

  Scenario: A Given step followed by a Then step is reported as acceptance criteria
    Given a SPEC.md containing:
      """
      ### FR-X-01: Alpha

      Given a project on disk
      When the user runs the tool
      Then it prints a report
      """
    When I run "oid check"
    Then the output contains "FR-X-01"
    And the output contains "acceptance criteria"

  Scenario: Bulleted and bold Gherkin steps are reported as acceptance criteria
    Given a SPEC.md containing:
      """
      ### FR-X-01: Alpha

      - **Given** a project on disk
      * **Then** it prints a report
      """
    When I run "oid check"
    Then the output contains "FR-X-01"
    And the output contains "acceptance criteria"

  Scenario: A Scenario line is reported as acceptance criteria
    Given a SPEC.md containing:
      """
      ### FR-X-01: Alpha

      Scenario: The tool prints a report
      """
    When I run "oid check"
    Then the output contains "FR-X-01"
    And the output contains "acceptance criteria"

  Scenario: An ordinary sentence starting with When is not flagged
    Given a SPEC.md containing:
      """
      ### FR-X-01: Alpha

      When the project has no configuration, the tool uses its defaults.
      """
    When I run "oid check"
    Then the output contains "no violations"
    And the output does not contain "acceptance criteria"

  Scenario: A lone Given sentence without a later Then is not flagged
    Given a SPEC.md containing:
      """
      ### FR-X-01: Alpha

      Given the defaults, the tool needs no setup at all.
      """
    When I run "oid check"
    Then the output contains "no violations"
    And the output does not contain "acceptance criteria"
