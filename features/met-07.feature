@FR-MET-07
Feature: Separate existing debt from new findings

  Background:
    Given a TypeScript project

  Scenario: The baseline records the current findings and says how many
    Given a project file "src/limits.ts" containing:
      """
      export const isLong = (n: number) => n > 42;
      export const isHuge = (n: number) => n > 77;
      """
    When I run "oid metrics --baseline"
    Then the command succeeds
    And the output says the baseline records 2 findings
    And the file ".outside-in/baseline.json" exists

  Scenario: A finding that is in the baseline is left out of the changed lines and the run succeeds
    Given a project file "src/limits.ts" containing:
      """
      export const isLong = (n: number) => n > 42;
      """
    And the project is a git repository with its files committed
    And I run "oid metrics --baseline"
    And a project file "src/limits.ts" containing:
      """
      export const isLong = (n: number): boolean => n > 42;
      """
    When I run "oid metrics --changed"
    Then the command succeeds
    And the magic_value findings do not mention "magic number 42"
    And the output says 1 existing finding was left out
    And the error output does not contain "no baseline"

  Scenario: A finding that is not in the baseline is listed and the run fails
    Given a project file "src/limits.ts" containing:
      """
      export const isLong = (n: number) => n > 42;
      """
    And the project is a git repository with its files committed
    And I run "oid metrics --baseline"
    And a project file "src/limits.ts" containing:
      """
      export const isLong = (n: number): boolean => n > 42;
      export const isHuge = (n: number) => n > 77;
      """
    When I run "oid metrics --changed"
    Then the command fails
    And the output contains "magic_value src/limits.ts:2-2 magic number 77"
    And the magic_value findings do not mention "magic number 42"
    And the output says 1 existing finding was left out

  Scenario: A finding that moved to other lines is still the same finding
    Given a project file "src/limits.ts" containing:
      """
      export const isLong = (n: number) => n > 42;
      """
    And the project is a git repository with its files committed
    And I run "oid metrics --baseline"
    And a project file "src/limits.ts" containing:
      """
      export const first = "a";
      export const second = "b";
      export const isLong = (n: number): boolean => n > 42;
      """
    When I run "oid metrics --changed"
    Then the command succeeds
    And the magic_value findings do not mention "magic number 42"
    And the output says 1 existing finding was left out

  Scenario: The same finding in another file is new
    Given a project file "src/limits.ts" containing:
      """
      export const isLong = (n: number) => n > 42;
      """
    And the project is a git repository with its files committed
    And I run "oid metrics --baseline"
    And a project file "src/copy.ts" containing:
      """
      export const isLong = (n: number) => n > 42;
      """
    When I run "oid metrics --changed"
    Then the command fails
    And the output contains "magic_value src/copy.ts:1-1 magic number 42"
    And the magic_value findings do not mention "src/limits.ts"

  Scenario: Without a baseline every finding on the changed lines is new
    Given a project file "src/limits.ts" containing:
      """
      export const isLong = (n: number) => n > 42;
      """
    And the project is a git repository with its files committed
    And a project file "src/limits.ts" containing:
      """
      export const isLong = (n: number): boolean => n > 42;
      """
    When I run "oid metrics --changed"
    Then the command fails
    And the output contains "magic_value src/limits.ts:1-1 magic number 42"
    And the error output contains "no baseline"
    And the error output contains "oid metrics --baseline"

  Scenario: The full report is not filtered by the baseline and succeeds
    Given a project file "src/limits.ts" containing:
      """
      export const isLong = (n: number) => n > 42;
      """
    And I run "oid metrics --baseline"
    When I run "oid metrics"
    Then the command succeeds
    And the file ".outside-in/baseline.json" exists
    And the output contains "magic_value src/limits.ts:1-1 magic number 42"
    And the output does not mention left out findings

  Scenario: The changed lines and the baseline cannot be asked for together
    Given a project file "src/limits.ts" containing:
      """
      export const isLong = (n: number) => n > 42;
      """
    And the project is a git repository with its files committed
    When I run "oid metrics --changed --baseline"
    Then the command fails
    And the error output contains "--changed and --baseline cannot be used together"
    And no ".outside-in/baseline.json" file exists

  Scenario: oid metrics --help describes the option that records the baseline
    When I run "oid metrics --help"
    Then the command succeeds
    And the output describes the option "--baseline"
