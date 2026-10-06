@FR-MET-03
Feature: Detect dead code

  Background:
    Given a TypeScript project
    And a project file "package.json" containing:
      """
      {
        "name": "fixture",
        "type": "module",
        "main": "src/main.ts"
      }
      """

  Scenario: An export that nothing imports is reported
    Given a project file "src/lib.ts" containing:
      """
      export function used(): number {
        return 1;
      }
      export function unusedExport(): number {
        return 2;
      }
      """
    And a project file "src/main.ts" containing:
      """
      import { used } from "./lib.js";
      console.log(used());
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "dead_code src/lib.ts:4-4 [unusedExport] unused export"
    And the dead_code findings do not mention "[used]"

  Scenario: An exported type that nothing imports is reported
    Given a project file "src/types.ts" containing:
      """
      export type Order = { id: number };
      export type Invoice = { id: number };
      """
    And a project file "src/main.ts" containing:
      """
      import type { Order } from "./types.js";
      export const first: Order = { id: 1 };
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "dead_code src/types.ts:2-2 [Invoice] unused export"
    And the dead_code findings do not mention "[Order]"

  Scenario: A file that nothing imports is reported
    Given a project file "src/orphan.ts" containing:
      """
      export const lonely = 1;
      """
    And a project file "src/main.ts" containing:
      """
      console.log("start");
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "dead_code src/orphan.ts:1-1 unused file"
    And the dead_code findings do not mention "src/main.ts"

  Scenario: A dependency that nothing uses is reported against package.json
    Given a project file "package.json" containing:
      """
      {
        "name": "fixture",
        "type": "module",
        "main": "src/main.ts",
        "dependencies": {
          "bun": "1.0.0",
          "left-pad": "1.3.0"
        }
      }
      """
    And a project file "src/main.ts" containing:
      """
      import leftPad from "left-pad";
      console.log(leftPad("a", 3));
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "dead_code package.json:6-6 unused dependency bun"
    And the dead_code findings do not mention "left-pad"

  Scenario: A development dependency that nothing uses is reported against package.json
    Given a project file "package.json" containing:
      """
      {
        "name": "fixture",
        "type": "module",
        "main": "src/main.ts",
        "devDependencies": {
          "dev-tool": "1.0.0"
        }
      }
      """
    And a project file "src/main.ts" containing:
      """
      console.log("start");
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "dead_code package.json:6-6 unused devDependency dev-tool"

  Scenario: An export used only by a test is not reported
    Given a project file "src/lib.ts" containing:
      """
      export function onlyTested(): number {
        return 1;
      }
      export function unusedExport(): number {
        return 2;
      }
      """
    And a project file "tests/unit/lib.test.ts" containing:
      """
      import { onlyTested } from "../../src/lib.js";
      console.log(onlyTested());
      """
    And a project file "src/main.ts" containing:
      """
      console.log("start");
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "dead_code src/lib.ts:4-4 [unusedExport] unused export"
    And the dead_code findings do not mention "onlyTested"
    And the dead_code findings do not mention "tests/unit/lib.test.ts"

  Scenario: Files named in the refactor entry configuration are entry points
    Given a project file "src/worker.ts" containing:
      """
      import { helper } from "./helper.js";
      console.log(helper());
      """
    And a project file "src/helper.ts" containing:
      """
      export function helper(): number {
        return 1;
      }
      """
    And a project file "src/orphan.ts" containing:
      """
      export const lonely = 1;
      """
    And a project file "src/main.ts" containing:
      """
      console.log("start");
      """
    And a project configuration with:
      | refactor.entry | ["src/worker.ts"] |
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "dead_code src/orphan.ts:1-1 unused file"
    And the dead_code findings do not mention "src/worker.ts"
    And the dead_code findings do not mention "src/helper.ts"

  Scenario: Generated files are not reported
    Given a project file "src/api.generated.ts" containing:
      """
      export const endpoint = "/orders";
      """
    And a project file "src/orphan.ts" containing:
      """
      export const lonely = 1;
      """
    And a project file "src/main.ts" containing:
      """
      console.log("start");
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "dead_code src/orphan.ts:1-1 unused file"
    And the dead_code findings do not mention "api.generated"

  Scenario: A local variable that is never read is reported
    Given a project file "src/main.ts" containing:
      """
      export function total(items: number[]): number {
        const unusedCount = items.length;
        return 0;
      }
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "dead_code src/main.ts:2-2 [unusedCount] unused declaration"

  Scenario: A parameter that is never used is reported unless its name starts with an underscore
    Given a project file "src/main.ts" containing:
      """
      export function pick(first: number, second: number, _third: number): number {
        return first;
      }
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "dead_code src/main.ts:1-1 [second] unused declaration"
    And the dead_code findings do not mention "_third"

  Scenario: An import that is never used is reported
    Given a project file "src/main.ts" containing:
      """
      import { readFileSync } from "node:fs";
      console.log("start");
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "dead_code src/main.ts:1-1 [readFileSync] unused declaration"

  Scenario: An import declaration whose names are all unused is reported once
    Given a project file "src/main.ts" containing:
      """
      import { readFileSync, writeFileSync } from "node:fs";
      console.log("start");
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "dead_code src/main.ts:1-1 unused imports"
    And the summary counts dead_code 1

  Scenario: A local variable that is never read in a test file is reported
    Given a project file "tests/unit/lib.test.ts" containing:
      """
      const unusedValue = 3;
      console.log("test");
      """
    And a project file "src/main.ts" containing:
      """
      console.log("start");
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "dead_code tests/unit/lib.test.ts:1-1 [unusedValue] unused declaration"

  Scenario: Several consecutive comment lines that are code are reported
    Given a project file "src/main.ts" containing:
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

  Scenario: A block comment that is code is reported
    Given a project file "src/main.ts" containing:
      """
      /*
      const legacy = compute();
      legacy.run();
      */
      export const value = 1;
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "dead_code src/main.ts:1-4 commented-out code"

  Scenario: A single commented-out line is not reported
    Given a project file "src/main.ts" containing:
      """
      export function total(items: number[]): number {
        // const old = 1;
        const unusedCount = items.length;
        return 0;
      }
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "[unusedCount] unused declaration"
    And the dead_code findings do not mention "commented-out code"

  Scenario: Prose, directives, documentation and license headers are not reported as commented-out code
    Given a project file "src/main.ts" containing:
      """
      /*
       * Copyright (c) 2026 Example Corp
       * Licensed under the MIT License.
       */

      /** Adds two numbers and returns the sum. */
      export function add(a: number, b: number): number {
        // TODO: handle overflow
        // NOTE: this is a plain sum
        return a + b;
      }

      // @ts-expect-error the next line is wrong on purpose
      // eslint-disable-next-line no-console
      console.log(add(1, 2));

      // const stale = compute();
      // stale.run();
      export const value = 1;
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "dead_code src/main.ts:17-18 commented-out code"
    And the summary counts dead_code 1

  Scenario: Unused locals are reported in a project without package.json
    Given the project has no "package.json" file
    And a project file "src/main.ts" containing:
      """
      export function total(items: number[]): number {
        const unusedCount = items.length;
        return 0;
      }
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "dead_code src/main.ts:2-2 [unusedCount] unused declaration"

  Scenario: The summary counts dead code next to the other categories
    Given a project file "src/main.ts" containing:
      """
      export function check(value: number): number {
        const unused = 1;
        if (value > 2) {
          return 1;
        }
        return 2;
      }
      """
    And a project configuration with:
      | refactor.detectors.complexity.max_cyclomatic | 1 |
    When I run "oid metrics"
    Then the command succeeds
    And the summary counts complexity 1
    And the summary counts dead_code 1
