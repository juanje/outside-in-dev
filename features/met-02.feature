@FR-MET-02
Feature: Detect duplication

  Background:
    Given a TypeScript project

  Scenario: A block duplicated in two source files is reported with both locations
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
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "duplication src/invoices.ts:1-9 9 duplicated lines, also src/orders.ts:1-9"

  Scenario: A block duplicated within one file is reported with both locations
    Given a project file "src/both.ts" containing:
      """
      export function first(items: number[]): number {
        let sum = 0;
        for (const item of items) {
          sum += item * 1;
          sum -= 1;
        }
        const average = sum / items.length;
        return Math.round(average);
      }

      export function second(items: number[]): number {
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
    And the output contains "duplication src/both.ts:1-9 9 duplicated lines, also src/both.ts:11-19"

  Scenario: A block copied from a source file into a test is reported
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
    And a project file "tests/unit/orders.test.ts" containing:
      """
      export function expectedTotal(items: number[]): number {
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
    And the output contains "duplication src/orders.ts:1-9 9 duplicated lines, also tests/unit/orders.test.ts:1-9"

  Scenario: Files that share a name in different directories are told apart
    Given a project file "src/orders/util.ts" containing:
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
    And a project file "src/invoices/util.ts" containing:
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
    And the output contains "duplication src/invoices/util.ts:1-9 9 duplicated lines, also src/orders/util.ts:1-9"

  Scenario: Code that is not duplicated is not reported
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
    And a project file "src/other.ts" containing:
      """
      export function greet(name: string): string {
        return `hello ${name}`;
      }
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "duplication src/invoices.ts:1-9"
    And the output does not contain "src/other.ts"

  Scenario: A repeated block shorter than the minimum is not reported
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
    And a project file "src/a.ts" containing:
      """
      export const a = [1, 0, -1].map((n) => n * -1);
      export const b = a.length;
      """
    And a project file "src/b.ts" containing:
      """
      export const c = [1, 0, -1].map((n) => n * -1);
      export const d = c.length;
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "duplication src/invoices.ts:1-9"
    And the output does not contain "src/a.ts"

  Scenario: The minimum number of lines comes from the configuration
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
    And a project configuration with:
      | refactor.detectors.duplication.min_lines | 10 |
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "no findings"

  Scenario: The summary counts duplication next to the other categories
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
    And a project configuration with:
      | refactor.detectors.complexity.max_cyclomatic | 1 |
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "complexity 2, duplication 1"
