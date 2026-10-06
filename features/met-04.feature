@FR-MET-04
Feature: Detect magic values

  Background:
    Given a TypeScript project

  Scenario: A numeric literal in an expression is reported with its location
    Given a project file "src/limits.ts" containing:
      """
      export function isTooLong(length: number): boolean {
        return length > 42;
      }
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "magic_value src/limits.ts:2-2 magic number 42"
    And the summary counts magic_value 1

  Scenario: A negative numeric literal is reported with its sign
    Given a project file "src/limits.ts" containing:
      """
      export function isTooLow(level: number): boolean {
        return level < -40;
      }
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "magic_value src/limits.ts:2-2 magic number -40"

  Scenario: The trivial values 0, 1 and -1 are not reported
    Given a project file "src/steps.ts" containing:
      """
      export function next(index: number): number {
        const previous = index - 1;
        return previous < 0 ? 7 : index + 1;
      }
      export function back(index: number): number {
        return index + -1;
      }
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "magic_value src/steps.ts:3-3 magic number 7"
    And the magic_value findings do not mention "magic number 0"
    And the magic_value findings do not mention "magic number 1"
    And the magic_value findings do not mention "magic number -1"
    And the magic_value findings do not mention "src/steps.ts:6"
    And the summary counts magic_value 1

  Scenario: A number named by a constant, an enum member or a literal type is not reported
    Given a project file "src/names.ts" containing:
      """
      const MAX_RETRIES = 5;
      const MIN_LEVEL = -20;
      export enum Level {
        Low = 10,
        High = 20,
      }
      export type Port = 8080;
      export function retries(): number {
        return MAX_RETRIES + MIN_LEVEL + Level.Low + Level.High + 300;
      }
      export const port: Port = 8080;
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "magic_value src/names.ts:9-9 magic number 300"
    And the summary counts magic_value 1

  Scenario: Numbers in test files are not reported
    Given a project file "src/limits.ts" containing:
      """
      export function isTooLong(length: number): boolean {
        return length > 42;
      }
      """
    And a project file "tests/unit/limits.test.ts" containing:
      """
      import { isTooLong } from "../../src/limits.js";
      export const result = isTooLong(4242);
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "magic_value src/limits.ts:2-2 magic number 42"
    And the magic_value findings do not mention "tests/unit/limits.test.ts"
    And the magic_value findings do not mention "4242"

  Scenario: A string repeated across files is reported once at its first occurrence with the others
    Given a project file "src/a.ts" containing:
      """
      export function isReady(status: string): boolean {
        return status === "pending";
      }
      """
    And a project file "src/b.ts" containing:
      """
      export function isWaiting(status: string): boolean {
        return status === "pending";
      }
      export function isIdle(status: string): boolean {
        return status !== "pending";
      }
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "magic_value src/a.ts:2-2 string \"pending\" repeated 3 times, also src/b.ts:2-2, also src/b.ts:5-5"
    And the summary counts magic_value 1

  Scenario: A string that appears fewer times than the minimum is not reported
    Given a project file "src/a.ts" containing:
      """
      export function isReady(status: string): boolean {
        return status === "pending" || status === "paused" || status === "paused";
      }
      export function isOpen(status: string): boolean {
        return status === "pending" || status === "open" || status === "open";
      }
      export function isLate(status: string): boolean {
        return status === "pending";
      }
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "string \"pending\" repeated 3 times"
    And the magic_value findings do not mention "paused"
    And the magic_value findings do not mention "open"

  Scenario: Imports, object keys, constants, types and the empty string do not count as repeated strings
    Given a project file "src/shared.ts" containing:
      """
      export const KIND = "kind";
      export type Kind = "kind";
      export const a = { kind: 1, "kind": 2 };
      export const b = { kind: 3, "kind": 4 };
      export const c = "";
      export const d = "";
      export const e = "";
      """
    And a project file "src/use.ts" containing:
      """
      import { KIND } from "./shared.js";
      import { KIND as OTHER } from "./shared.js";
      export * from "./shared.js";
      export function label(): string {
        return KIND + OTHER + "tag" + "tag" + "tag" + "";
      }
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "string \"tag\" repeated 3 times"
    And the magic_value findings do not mention "shared.js"
    And the magic_value findings do not mention "\"kind\""
    And the magic_value findings do not mention "string \"\""

  Scenario: Values listed in refactor.detectors.magic_value.ignore are not reported
    Given a project configuration with:
      | refactor.detectors.magic_value.ignore | [0, 1, -1, 42] |
    And a project file "src/limits.ts" containing:
      """
      export function isTooLong(length: number): boolean {
        return length > 42 || length > 43;
      }
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "magic number 43"
    And the magic_value findings do not mention "magic number 42"

  Scenario: The minimum number of string repeats comes from refactor.detectors.magic_value.min_string_repeats
    Given a project configuration with:
      | refactor.detectors.magic_value.min_string_repeats | 2 |
    And a project file "src/a.ts" containing:
      """
      export function isReady(status: string): boolean {
        return status === "pending" || status === "pending";
      }
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "magic_value src/a.ts:2-2 string \"pending\" repeated 2 times, also src/a.ts:2-2"
