Feature: Prose in comments never stops oid metrics

  Background:
    Given a TypeScript project

  @FR-MET-03
  Scenario: A run of line comments that reads like broken code does not stop the command
    Given a project file "src/notes.ts" containing:
      """
      // Registering a package is unsafe, and offering it
      // for import produces a permanently broken install.
      export const registered = 2;
      """
    And a project file "src/main.ts" containing:
      """
      export function total(): number {
        // const old = 1;
        // return old + 1;
        return 2;
      }
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "dead_code src/main.ts:2-3 commented-out code"
    And the dead_code findings do not mention "src/notes.ts:1-2 commented-out code"

  @FR-MET-03
  Scenario: The findings of the other detectors are still printed when a comment reads like broken code
    Given a project file "src/notes.ts" containing:
      """
      // Registering a package is unsafe, and offering it
      // for import produces a permanently broken install.
      export const registered = 2;
      """
    And a project file "src/limits.ts" containing:
      """
      export function limit(): number {
        return 42;
      }
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "magic_value src/limits.ts:2-2 magic number 42"
    And the summary counts magic_value 1
