Feature: Test files and uncompiled files are scanned for duplication and commented-out code

  Background:
    Given a TypeScript project
    And a project file "tsconfig.json" containing:
      """
      { "compilerOptions": { "strict": true, "module": "NodeNext", "moduleResolution": "NodeNext", "target": "ES2022" }, "include": ["src/**/*.ts"] }
      """

  @FR-MET-02
  Scenario: A block duplicated between two test files that tsconfig.json does not compile is reported
    Given a project file "tests/unit/orders.test.ts" containing:
      """
      export function orderTotal(items: number[]): number {
        let sum = 0;
        for (const item of items) {
          sum += item * 1;
          sum -= 1;
        }
        const average = sum / items.length;
        return Math.round(average);
      }
      """
    And a project file "tests/unit/invoices.test.ts" containing:
      """
      export function invoiceTotal(items: number[]): number {
        let sum = 0;
        for (const item of items) {
          sum += item * 1;
          sum -= 1;
        }
        const average = sum / items.length;
        return Math.round(average);
      }
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "duplication tests/unit/invoices.test.ts:1-9 9 duplicated lines, also tests/unit/orders.test.ts:1-9"

  @FR-MET-02
  Scenario: A block duplicated between a source file and an uncompiled test file is reported
    Given a project file "src/orders.ts" containing:
      """
      export function orderTotal(items: number[]): number {
        let sum = 0;
        for (const item of items) {
          sum += item * 1;
          sum -= 1;
        }
        const average = sum / items.length;
        return Math.round(average);
      }
      """
    And a project file "tests/unit/invoices.test.ts" containing:
      """
      export function invoiceTotal(items: number[]): number {
        let sum = 0;
        for (const item of items) {
          sum += item * 1;
          sum -= 1;
        }
        const average = sum / items.length;
        return Math.round(average);
      }
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "duplication src/orders.ts:1-9 9 duplicated lines, also tests/unit/invoices.test.ts:1-9"

  @FR-MET-02
  Scenario: A block duplicated between two source files that tsconfig.json does not compile is reported
    Given a project file "src/orders.mts" containing:
      """
      export function orderTotal(items: number[]): number {
        let sum = 0;
        for (const item of items) {
          sum += item * 1;
          sum -= 1;
        }
        const average = sum / items.length;
        return Math.round(average);
      }
      """
    And a project file "src/invoices.mts" containing:
      """
      export function invoiceTotal(items: number[]): number {
        let sum = 0;
        for (const item of items) {
          sum += item * 1;
          sum -= 1;
        }
        const average = sum / items.length;
        return Math.round(average);
      }
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "duplication src/invoices.mts:1-9 9 duplicated lines, also src/orders.mts:1-9"

  @FR-MET-03
  Scenario: Commented-out code in a test file that tsconfig.json does not compile is reported
    Given a project file "tests/unit/orders.test.ts" containing:
      """
      // const legacy = compute();
      // legacy.run();
      export const value = 7;
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "dead_code tests/unit/orders.test.ts:1-2 commented-out code"

  @FR-MET-03
  Scenario: Commented-out code in a source file that tsconfig.json does not compile is reported
    Given a project file "src/orders.mts" containing:
      """
      // const legacy = compute();
      // legacy.run();
      export const value = 7;
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "dead_code src/orders.mts:1-2 commented-out code"
