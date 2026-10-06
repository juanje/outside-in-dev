Feature: The baseline file can be read by a person

  Background:
    Given a TypeScript project

  @FR-MET-07
  Scenario: The baseline file is a readable list of records, one per finding
    Given a project file "src/limits.ts" containing:
      """
      export const isLong = (n: number) => n > 42;
      """
    When I run "oid metrics --baseline"
    Then the command succeeds
    And the baseline file is indented by 2 spaces and holds no escaped text
    And the baseline holds the record:
      """
      { "category": "magic_value", "file": "src/limits.ts", "detail": "magic number 42" }
      """

  @FR-MET-07
  Scenario: The baseline record of a complexity finding keeps N where the numbers were
    Given a project file "src/total.ts" containing:
      """
      export function total(a: boolean): number {
        let n = 0;
        if (a) n++;
        if (a) n++;
        if (a) n++;
        if (a) n++;
        if (a) n++;
        if (a) n++;
        if (a) n++;
        if (a) n++;
        if (a) n++;
        if (a) n++;
        if (a) n++;
        return n;
      }
      """
    When I run "oid metrics --baseline"
    Then the command succeeds
    And the baseline holds the record:
      """
      { "category": "complexity", "file": "src/total.ts", "symbol": "total", "detail": "cyclomatic complexity N > N" }
      """

  @FR-MET-07
  Scenario: The baseline record of a duplication finding lists its two files and no lines
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
    And a project file "src/invoices.ts" containing:
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
    When I run "oid metrics --baseline"
    Then the command succeeds
    And the baseline holds the record:
      """
      { "category": "duplication", "files": ["src/invoices.ts", "src/orders.ts"], "detail": "9 duplicated lines" }
      """
