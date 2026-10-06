@FR-MET-06
Feature: Record and show code health

  Background:
    Given a TypeScript project

  Scenario: The first run records a snapshot of every category and of duplication
    Given a project file "src/limits.ts" containing:
      """
      export const isLong = (n: number) => n > 42;
      """
    When I run "oid metrics"
    Then the command succeeds
    And the file ".outside-in/metrics.jsonl" has 1 snapshot
    And the last snapshot is complete
    And the last snapshot counts magic_value 1
    And the last snapshot counts complexity 0
    And the output has the trend line "trend: first snapshot"

  Scenario: A later run appends to the history instead of replacing it
    Given a project file "src/limits.ts" containing:
      """
      export const isLong = (n: number) => n > 42;
      """
    When I run "oid metrics"
    And I run "oid metrics"
    Then the command succeeds
    And the file ".outside-in/metrics.jsonl" has 2 snapshots
    And the last snapshot counts magic_value 1
    And the output has the trend line "trend: no change"

  Scenario: The trend shows the categories whose count changed
    Given a project file "src/limits.ts" containing:
      """
      export const isLong = (n: number) => n > 42;
      export const isHuge = (n: number) => n > 4242;
      """
    When I run "oid metrics"
    And a project file "src/limits.ts" containing:
      """
      export const isLong = (n: number) => n > 42;
      """
    And I run "oid metrics"
    Then the command succeeds
    And the output has the trend line "trend: magic_value 2 → 1"
    And the last snapshot counts magic_value 1

  Scenario: The percentage of duplicated lines in the source files is recorded and shown
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
    And a project file "src/names.ts" containing:
      """
      export const first = "Ada";
      export const second = "Grace";
      """
    When I run "oid metrics"
    Then the command succeeds
    And the last snapshot records duplication of source files 90
    And the last snapshot records duplication of test files 0
    And the output has the trend line "trend: first snapshot"

  Scenario: The duplication of the test files is recorded apart from the source files
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
    And a project file "src/names.ts" containing:
      """
      export const first = "Ada";
      """
    When I run "oid metrics"
    Then the command succeeds
    And the last snapshot records duplication of source files 0
    And the last snapshot records duplication of test files 100

  Scenario: The trend shows a change in the percentage of duplicated lines
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
    And a project file "src/names.ts" containing:
      """
      export const first = "Ada";
      """
    When I run "oid metrics"
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
    And I run "oid metrics"
    Then the command succeeds
    And the output has the trend line "trend: duplication of source files 0.0% → 94.7%"

  Scenario: Only the findings on lines changed since the last commit are listed
    Given a project file "src/old.ts" containing:
      """
      export const isOld = (n: number) => n > 42;
      """
    And a project file "src/recent.ts" containing:
      """
      export const isRecent = (n: number) => n > 7;
      """
    And the project is a git repository with its files committed
    And a project file "src/recent.ts" containing:
      """
      export const isRecent = (n: number) => n > 8;
      """
    When I run "oid metrics --changed"
    Then the command succeeds
    And the output contains "magic_value src/recent.ts:1-1 magic number 8"
    And the magic_value findings do not mention "magic number 42"
    And the magic_value findings do not mention "magic number 7"

  Scenario: In a changed file only the changed lines count
    Given a project file "src/limits.ts" containing:
      """
      export const isLong = (n: number) => n > 42;
      export const a = "a";
      export const b = "b";
      export const c = "c";
      export const isHuge = (n: number) => n > 77;
      """
    And the project is a git repository with its files committed
    And a project file "src/limits.ts" containing:
      """
      export const isLong = (n: number) => n > 42;
      export const a = "a";
      export const b = "b";
      export const c = "c";
      export const isHuge = (n: number) => n > 88;
      """
    When I run "oid metrics --changed"
    Then the command succeeds
    And the output contains "magic_value src/limits.ts:5-5 magic number 88"
    And the magic_value findings do not mention "magic number 42"

  Scenario: A file that is not committed yet counts as entirely changed
    Given a project file "src/old.ts" containing:
      """
      export const isOld = (n: number) => n > 42;
      """
    And the project is a git repository with its files committed
    And a project file "src/fresh.ts" containing:
      """
      export const isFresh = (n: number) => n > 99;
      """
    When I run "oid metrics --changed"
    Then the command succeeds
    And the output contains "magic_value src/fresh.ts:1-1 magic number 99"
    And the magic_value findings do not mention "magic number 42"

  Scenario: A staged change counts as changed
    Given a project file "src/old.ts" containing:
      """
      export const isOld = (n: number) => n > 42;
      """
    And a project file "src/steady.ts" containing:
      """
      export const isSteady = (n: number) => n > 5;
      """
    And the project is a git repository with its files committed
    And a project file "src/old.ts" containing:
      """
      export const isOld = (n: number) => n > 43;
      """
    And the changes are staged
    When I run "oid metrics --changed"
    Then the command succeeds
    And the output contains "magic_value src/old.ts:1-1 magic number 43"
    And the magic_value findings do not mention "magic number 5"

  Scenario: A block duplicated between two files is listed when a changed line is in either of them
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
    And a project file "src/steady.ts" containing:
      """
      export const isSteady = (n: number) => n > 5;
      """
    And the project is a git repository with its files committed
    And a project file "src/orders.ts" containing:
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
    When I run "oid metrics --changed"
    Then the command succeeds
    And the output contains "duplication src/invoices.ts:1-9 9 duplicated lines, also src/orders.ts:1-9"
    And the magic_value findings do not mention "magic number 5"

  Scenario: Findings on a line of package.json that changed are listed
    Given a project file "package.json" containing:
      """
      {
        "name": "fixture",
        "dependencies": {
          "left-pad": "1.3.0",
          "right-pad": "1.0.0"
        }
      }
      """
    And a project file "src/main.ts" containing:
      """
      export const main = "main";
      """
    And the project is a git repository with its files committed
    And a project file "package.json" containing:
      """
      {
        "name": "fixture",
        "dependencies": {
          "left-pad": "1.3.1",
          "right-pad": "1.0.0"
        }
      }
      """
    When I run "oid metrics --changed"
    Then the command succeeds
    And the output contains "dead_code package.json:4-4 unused dependency left-pad"
    And the dead_code findings do not mention "right-pad"

  Scenario: A run limited to the changed lines records no snapshot and shows no trend
    Given a project file "src/old.ts" containing:
      """
      export const isOld = (n: number) => n > 42;
      """
    And a project file "src/steady.ts" containing:
      """
      export const isSteady = (n: number) => n > 5;
      """
    And the project is a git repository with its files committed
    And a project file "src/old.ts" containing:
      """
      export const isOld = (n: number) => n > 43;
      """
    When I run "oid metrics --changed"
    Then the command succeeds
    And the output contains "magic_value src/old.ts:1-1 magic number 43"
    And the magic_value findings do not mention "magic number 5"
    And no ".outside-in/metrics.jsonl" file exists
    And the output has no trend line

  Scenario: Changed lines cannot be told outside a git repository
    Given a project file "src/old.ts" containing:
      """
      export const isOld = (n: number) => n > 42;
      """
    When I run "oid metrics --changed"
    Then the command fails
    And the error output contains "not a git repository"

  Scenario: Changed lines cannot be told before the first commit
    Given a project file "src/old.ts" containing:
      """
      export const isOld = (n: number) => n > 42;
      """
    And the project is a git repository without commits
    When I run "oid metrics --changed"
    Then the command fails
    And the error output contains "no commits"

  Scenario: oid metrics --help describes the option that limits the findings to the changed lines
    When I run "oid metrics --help"
    Then the command succeeds
    And the output describes the option "--changed"
    And the output contains "usage: oid metrics [--changed]"
