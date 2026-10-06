Feature: A baseline oid cannot read is refused, not guessed

  Background:
    Given a TypeScript project
    And a project file "src/limits.ts" containing:
      """
      export const isLong = (n: number) => n > 42;
      """
    And the project is a git repository with its files committed
    And a project file "src/limits.ts" containing:
      """
      export const isLong = (n: number): boolean => n > 42;
      """

  @FR-MET-07
  Scenario: A baseline in the old format of escaped text is refused
    Given a project file ".outside-in/baseline.json" containing:
      """
      [
        "[\"magic_value\",\"src/limits.ts\",null,\"magic number 42\"]"
      ]
      """
    When I run "oid metrics --changed"
    Then the command fails
    And the error output contains ".outside-in/baseline.json"
    And the error output contains "oid metrics --baseline"
    And the output is empty

  @FR-MET-07
  Scenario: A baseline that is not JSON is refused
    Given a project file ".outside-in/baseline.json" containing:
      """
      this is not { json
      """
    When I run "oid metrics --changed"
    Then the command fails
    And the error output contains ".outside-in/baseline.json"
    And the error output contains "oid metrics --baseline"
    And the error output does not contain "SyntaxError"
    And the output is empty

  @FR-MET-07
  Scenario: A baseline of JSON of another shape is refused
    Given a project file ".outside-in/baseline.json" containing:
      """
      { "findings": [] }
      """
    When I run "oid metrics --changed"
    Then the command fails
    And the error output contains ".outside-in/baseline.json"
    And the error output contains "oid metrics --baseline"
    And the error output does not contain "TypeError"
    And the output is empty
