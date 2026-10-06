@FR-MET-05
Feature: Detect documentation drift

  Background:
    Given a TypeScript project

  Scenario: A @param that names no parameter is reported
    Given a project file "src/greet.ts" containing:
      """
      /**
       * Builds a greeting.
       * @param name who is greeted
       * @param nmae a typo
       */
      export function greet(name: string): string {
        return name;
      }
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "doc_drift src/greet.ts:1-5 [greet] @param nmae matches no parameter"
    And the summary counts doc_drift 1

  Scenario: A parameter missing from a JSDoc that documents parameters is reported
    Given a project file "src/range.ts" containing:
      """
      export class Range {
        /**
         * Tells whether a value is inside the range.
         * @param value the value to test
         */
        contains(value: number, inclusive: boolean): boolean {
          return inclusive ? value >= 0 : value > 0;
        }
      }
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "doc_drift src/range.ts:2-5 [Range.contains] parameter inclusive is not documented"
    And the summary counts doc_drift 1

  Scenario: A JSDoc that matches the signature or documents no parameters is not reported
    Given a project file "src/pair.ts" containing:
      """
      /**
       * Adds two numbers.
       * @param left the first number
       * @param right the second number
       */
      export function add(left: number, right: number): number {
        return left + right;
      }

      /** Returns the text unchanged. */
      export function keep(text: string): string {
        return text;
      }

      /**
       * Joins two texts.
       * @param first the first text
       * @param second the second text
       * @param third a text that does not exist
       */
      export function join(first: string, second: string): string {
        return first + second;
      }
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "doc_drift src/pair.ts:15-20 [join] @param third matches no parameter"
    And the doc_drift findings do not mention "[add]"
    And the doc_drift findings do not mention "[keep]"
    And the summary counts doc_drift 1

  Scenario: A destructured parameter is matched by the root name its JSDoc uses
    Given a project file "src/options.ts" containing:
      """
      /**
       * Starts the server.
       * @param settings the settings
       * @param settings.port the port to listen on
       * @param ghots whether to be verbose
       */
      export function start({ port }: { port: number }, ghost: boolean): number {
        return ghost ? port : 0;
      }

      /**
       * Stops the server.
       * @param reason why it stops
       */
      export function stop({ port }: { port: number }, reason: string): string {
        return `${port}${reason}`;
      }
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "doc_drift src/options.ts:1-6 [start] @param ghots matches no parameter"
    And the output contains "doc_drift src/options.ts:1-6 [start] parameter ghost is not documented"
    And the doc_drift findings do not mention "@param settings"
    And the doc_drift findings do not mention "[stop]"
    And the summary counts doc_drift 2

  Scenario: A function call in a Markdown file that no source file declares is reported
    Given a project file "src/table.ts" containing:
      """
      export function renderTable(): string {
        return "";
      }
      export class Printer {
        print(): string {
          return renderTable();
        }
      }
      """
    And a project file "README.md" containing:
      """
      # Demo

      Call `renderTable()` to get the text.
      Call `drawChart()` to get a picture, or `print()` on a printer.
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "doc_drift README.md:4-4 `drawChart()` is not declared in source"
    And the doc_drift findings do not mention "renderTable"
    And the doc_drift findings do not mention "print()"
    And the summary counts doc_drift 1

  Scenario: A PascalCase name in a Markdown file that no source file declares is reported
    Given a project file "src/model.ts" containing:
      """
      export interface UserRecord {
        name: string;
      }
      export type AccountKind = "free" | "paid";
      export enum Plan {
        Basic,
      }
      export const DefaultLimits = { users: 5 };
      """
    And a project file "docs/model.md" containing:
      """
      The `UserRecord` interface, the `AccountKind` type, the `Plan` enum and
      the `DefaultLimits` object are described here, but `OrderBook` is gone.
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "doc_drift docs/model.md:2-2 `OrderBook` is not declared in source"
    And the doc_drift findings do not mention "UserRecord"
    And the doc_drift findings do not mention "AccountKind"
    And the doc_drift findings do not mention "`Plan`"
    And the doc_drift findings do not mention "DefaultLimits"
    And the summary counts doc_drift 1

  Scenario: A relative path in a Markdown file to a file that does not exist is reported
    Given a project file "src/util/text.ts" containing:
      """
      export const SEPARATOR = "-";
      """
    And a project file "README.md" containing:
      """
      The code lives in `src/util/text.ts`, also reachable as `util/text.ts`,
      while `src/util/old.ts` and `scripts/build.js` are no longer there.
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "doc_drift README.md:2-2 `src/util/old.ts` does not exist"
    And the output contains "doc_drift README.md:2-2 `scripts/build.js` does not exist"
    And the doc_drift findings do not mention "`src/util/text.ts`"
    And the doc_drift findings do not mention "`util/text.ts`"
    And the summary counts doc_drift 2

  Scenario: Code in fenced blocks and other inline code is not checked
    Given a project file "src/real.ts" containing:
      """
      export function realThing(): number {
        return 2;
      }
      """
    And a project file "README.md" containing:
      """
      Run `npm install`, set `MAX_SIZE` and read `notes.txt`.
      Call `vanished()` here.

      ```ts
      vanished();
      new GoneClass();
      ```
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "doc_drift README.md:2-2 `vanished()` is not declared in source"
    And the doc_drift findings do not mention "npm"
    And the doc_drift findings do not mention "MAX_SIZE"
    And the doc_drift findings do not mention "notes.txt"
    And the doc_drift findings do not mention "GoneClass"
    And the doc_drift findings do not mention "README.md:5"
    And the summary counts doc_drift 1

  Scenario: Only the Markdown files of the configured documentation paths are checked
    Given a project configuration with:
      | paths.docs | ["guide/**"] |
    And a project file "README.md" containing:
      """
      The `lostFromReadme()` function is gone.
      """
    And a project file "guide/intro.md" containing:
      """
      The `lostFromGuide()` function is gone.
      """
    And a project file "guide/sketch.txt" containing:
      """
      The `lostFromText()` function is gone.
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "doc_drift guide/intro.md:1-1 `lostFromGuide()` is not declared in source"
    And the doc_drift findings do not mention "lostFromReadme"
    And the doc_drift findings do not mention "lostFromText"
    And the summary counts doc_drift 1

  Scenario: The default documentation paths are the README and the docs directory
    Given a project file "README.md" containing:
      """
      The `lostFromReadme()` function is gone.
      """
    And a project file "docs/guide/api.md" containing:
      """
      The `lostFromApi()` function is gone.
      """
    And a project file "notes/todo.md" containing:
      """
      The `lostFromNotes()` function is gone.
      """
    When I run "oid metrics"
    Then the command succeeds
    And the output contains "doc_drift README.md:1-1 `lostFromReadme()` is not declared in source"
    And the output contains "doc_drift docs/guide/api.md:1-1 `lostFromApi()` is not declared in source"
    And the doc_drift findings do not mention "lostFromNotes"
    And the summary counts doc_drift 2
