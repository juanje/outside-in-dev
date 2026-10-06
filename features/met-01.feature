@FR-MET-01
Feature: Detect complexity

  Background:
    Given a TypeScript project

  Scenario: A function with too many decision points is reported with its location
    Given a project file "src/classify.ts" containing:
      """
      export function classify(n: number): string {
        if (n === 1) return "a";
        if (n === 2) return "b";
        if (n === 3) return "c";
        if (n === 4) return "d";
        if (n === 5) return "e";
        if (n === 6) return "f";
        if (n === 7) return "g";
        if (n === 8) return "h";
        if (n === 9) return "i";
        if (n === 10) return "j";
        if (n === 11) return "k";
        return "z";
      }
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "complexity src/classify.ts:1-14 [classify] cyclomatic complexity 12 > 10"

  Scenario: A function nested too deeply is reported with its location
    Given a project file "src/nest.ts" containing:
      """
      export function nest(a: boolean): number {
        if (a) {
          if (a) {
            if (a) {
              if (a) {
                if (a) {
                  return 1;
                }
              }
            }
          }
        }
        return 0;
      }
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "complexity src/nest.ts:1-14 [nest] nesting depth 5 > 4"

  Scenario: A project within the limits has no findings
    Given a project file "src/simple.ts" containing:
      """
      export function simple(a: number): number {
        if (a > 0) {
          return a;
        }
        return 0;
      }
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "no findings"
    And the output does not contain "complexity"

  Scenario: The summary counts the findings per category
    Given a project file "src/pair.ts" containing:
      """
      export function first(a: boolean): number {
        return a ? 1 : 0;
      }

      export function second(a: boolean): number {
        return a ? 3 : 4;
      }
      """
    And a project configuration with:
      | refactor.detectors.complexity.max_cyclomatic | 1 |
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "complexity 2"

  Scenario: Methods, arrow functions and anonymous functions get a symbol
    Given a project file "src/names.ts" containing:
      """
      export class Router {
        route(a: boolean): number {
          return a ? 1 : 0;
        }
      }

      export const pick = (a: boolean) => (a ? 1 : 0);

      export const doubled = [1, 2].map((n) => (n > 1 ? n : 0));
      """
    And a project configuration with:
      | refactor.detectors.complexity.max_cyclomatic | 1 |
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "complexity src/names.ts:2-4 [Router.route] cyclomatic complexity 2 > 1"
    And the output contains "complexity src/names.ts:7-7 [pick] cyclomatic complexity 2 > 1"
    And the output contains "complexity src/names.ts:9-9 [<anonymous>] cyclomatic complexity 2 > 1"

  Scenario: Every kind of decision point counts once and default does not count
    Given a project file "src/everything.ts" containing:
      """
      export function everything(items: number[], flag: boolean, fallback?: number): number {
        let total = 0;
        if (flag) total += 1;
        for (let i = 0; i < 2; i++) total += i;
        for (const item of items) total += item;
        for (const key in items) total += key.length;
        while (total < 0) total += 1;
        do {
          total += 1;
        } while (total < 0);
        switch (total) {
          case 1:
            total += 1;
            break;
          case 2:
            total += 2;
            break;
          default:
            total += 3;
        }
        try {
          total += 1;
        } catch {
          total += 2;
        }
        return flag ? (total && fallback) || (fallback ?? 0) : 0;
      }
      """
    And a project configuration with:
      | refactor.detectors.complexity.max_cyclomatic | 13 |
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "[everything] cyclomatic complexity 14 > 13"

  Scenario: A nested function is counted on its own, not in the function around it
    Given a project file "src/outer.ts" containing:
      """
      export function outer(a: number): number {
        if (a > 0) {
          a += 1;
        }
        if (a > 1) {
          a += 1;
        }
        function inner(b: number): number {
          if (b > 0) return 1;
          if (b > 1) return 2;
          if (b > 2) return 3;
          if (b > 3) return 4;
          return 5;
        }
        return inner(a);
      }
      """
    And a project configuration with:
      | refactor.detectors.complexity.max_cyclomatic | 3 |
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "[inner] cyclomatic complexity 5 > 3"
    And the output does not contain "[outer]"

  Scenario: Findings are listed by file and then by line
    Given a project file "src/b.ts" containing:
      """
      export function fromB(a: boolean): number {
        return a ? 1 : 0;
      }
      """
    And a project file "src/a.ts" containing:
      """
      export function firstOfA(a: boolean): number {
        return a ? 1 : 0;
      }

      export function secondOfA(a: boolean): number {
        return a ? 1 : 0;
      }
      """
    And a project configuration with:
      | refactor.detectors.complexity.max_cyclomatic | 1 |
    When I run "oid metrics"
    Then the command succeeds
    And the output lists these in order:
      | complexity src/a.ts:1-3 [firstOfA]  |
      | complexity src/a.ts:5-7 [secondOfA] |
      | complexity src/b.ts:1-3 [fromB]     |

  Scenario: Test files are not analysed
    Given a project file "tests/unit/busy.test.ts" containing:
      """
      export function busy(a: boolean): number {
        return a ? 1 : 0;
      }
      """
    And a project configuration with:
      | refactor.detectors.complexity.max_cyclomatic | 1 |
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "no findings"
    And the output does not contain "busy"

  Scenario: A file matching the configured test globs is a test even under the source path
    Given a project file "src/busy.test.ts" containing:
      """
      export function busyTest(a: boolean): number {
        return a ? 1 : 0;
      }
      """
    And a project file "src/busy.ts" containing:
      """
      export function busySource(a: boolean): number {
        return a ? 1 : 0;
      }
      """
    And a project configuration with:
      | paths.unit_tests                             | ["src/**/*.test.ts"] |
      | refactor.detectors.complexity.max_cyclomatic | 1                    |
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "[busySource]"
    And the output does not contain "busyTest"

  Scenario: The source files are the ones the configuration names
    Given a project file "lib/shared.ts" containing:
      """
      export function shared(a: boolean): number {
        return a ? 1 : 0;
      }
      """
    And a project file "src/ignored.ts" containing:
      """
      export function ignored(a: boolean): number {
        return a ? 1 : 0;
      }
      """
    And a project file "tsconfig.json" containing:
      """
      {
        // both folders are compiled
        "compilerOptions": { "strict": true, "module": "NodeNext", "target": "ES2022", },
        "include": ["src/**/*.ts", "lib/**/*.ts"],
      }
      """
    And a project configuration with:
      | paths.source                                 | ["lib/**"] |
      | refactor.detectors.complexity.max_cyclomatic | 1          |
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "lib/shared.ts:1-3 [shared]"
    And the output does not contain "ignored"

  Scenario: A source file that tsconfig.json does not compile is not analysed
    Given a project file "src/compiled.ts" containing:
      """
      export function compiled(a: boolean): number {
        return a ? 1 : 0;
      }
      """
    And a project file "src/skipped.ts" containing:
      """
      export function skipped(a: boolean): number {
        return a ? 1 : 0;
      }
      """
    And a project file "tsconfig.json" containing:
      """
      {
        "compilerOptions": { "strict": true, "module": "NodeNext", "target": "ES2022" },
        "include": ["src/**/*.ts"],
        "exclude": ["src/skipped.ts"]
      }
      """
    And a project configuration with:
      | refactor.detectors.complexity.max_cyclomatic | 1 |
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "[compiled]"
    And the output does not contain "skipped"

  Scenario: Raising a limit in the configuration removes the finding
    Given a project file "src/pair.ts" containing:
      """
      export function pair(a: boolean): number {
        return a ? 1 : 0;
      }
      """
    And a project configuration with:
      | refactor.detectors.complexity.max_cyclomatic | 2 |
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "no findings"

  Scenario: A limit left out of the configuration keeps its default
    Given a project file "src/nest.ts" containing:
      """
      export function nest(a: boolean): number {
        if (a) {
          if (a) {
            if (a) {
              if (a) {
                if (a) {
                  return 1;
                }
              }
            }
          }
        }
        return 0;
      }
      """
    And a project configuration with:
      | refactor.detectors.complexity.max_cyclomatic | 20 |
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "[nest] nesting depth 5 > 4"

  Scenario: A project without tsconfig.json is reported
    Given the project has no "tsconfig.json" file
    When I run "oid metrics"
    Then the command fails
    And the error output contains "tsconfig.json"

  Scenario: An invalid project configuration is reported
    Given an invalid project configuration file
    When I run "oid metrics"
    Then the command fails
    And the error output contains ".outside-in.json is not valid JSON"

  Scenario: oid --help lists the metrics command
    When I run "oid --help"
    Then the command succeeds
    And the output describes the command "metrics"

  Scenario: oid metrics --help describes the command
    When I run "oid metrics --help"
    Then the command succeeds
    And the output contains "usage: oid metrics"
    And the error output is empty
