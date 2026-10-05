Feature: Report a missing SPEC.md or an unparseable feature file instead of crashing

  @FR-CHECK-04
  Scenario: A missing SPEC.md is reported as a violation
    When I run "oid check"
    Then the command fails
    And the output contains "SPEC.md not found"
    And the error output does not contain "ENOENT"

  @FR-CHECK-04
  Scenario: A missing SPEC.md is reported in the JSON document
    When I run "oid check --json"
    Then the command fails
    And the output is a single JSON document
    And the JSON report says ok is false
    And the JSON report has a "spec" violation containing "SPEC.md not found"
    And the error output does not contain "ENOENT"

  @FR-CHECK-02
  Scenario: A feature file with a Gherkin syntax error is reported with its file name
    Given a SPEC.md containing:
      """
      ### FR-X-01: Alpha

      The tool does alpha.
      """
    And a feature file "features/broken.feature" containing:
      """
      @FR-X-01
      Feature: Broken

        Scenario: Alpha works
          Given alpha
      Feature: Again
      """
    When I run "oid check"
    Then the command fails
    And the output contains "features/broken.feature"
    And the error output does not contain "CompositeParserException"

  @FR-CHECK-04
  Scenario: A feature file with a Gherkin syntax error is reported in the JSON document
    Given a SPEC.md containing:
      """
      ### FR-X-01: Alpha

      The tool does alpha.
      """
    And a feature file "features/broken.feature" containing:
      """
      Feature x
      """
    When I run "oid check --json"
    Then the command fails
    And the output is a single JSON document
    And the JSON report has a "traceability" violation containing "features/broken.feature"
