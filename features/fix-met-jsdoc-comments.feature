Feature: JSDoc blocks are never reported as commented-out code

  Background:
    Given a TypeScript project

  @FR-MET-03
  Scenario: A JSDoc block whose prose reads like broken code does not stop the command
    Given a project file "src/doc.ts" containing:
      """
      /**
       * Registers a package. Doing so is unsafe, and offering it
       * for import produces a permanently broken install.
       */
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
    And the dead_code findings do not mention "src/doc.ts:1-4 commented-out code"
