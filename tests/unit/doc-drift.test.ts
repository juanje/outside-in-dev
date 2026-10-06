import { describe, expect, it } from "vitest";
import { declaredNames, findJsdocDrift, findStaleReferences } from "../../src/artifacts/doc-drift.js";

describe("findJsdocDrift", () => {
  it("reports a @param that names no parameter, over the lines of the JSDoc, for the function", () => {
    const text = "/**\n * Builds a greeting.\n * @param name who is greeted\n * @param nmae a typo\n */\nexport function greet(name: string): string {\n  return name;\n}\n";
    expect(findJsdocDrift(text)).toEqual([{ start: 1, end: 5, symbol: "greet", detail: "@param nmae matches no parameter" }]);
  });

  it("reports a parameter that a JSDoc documenting parameters leaves out", () => {
    const text = "/**\n * Adds.\n * @param left the first\n */\nexport function add(left: number, right: number): number {\n  return left + right;\n}\n";
    expect(findJsdocDrift(text)).toEqual([{ start: 1, end: 4, symbol: "add", detail: "parameter right is not documented" }]);
  });

  it("checks methods too, named after their class", () => {
    const text = "export class Range {\n  /**\n   * Tells.\n   * @param value the value\n   */\n  contains(value: number, inclusive: boolean): boolean {\n    return inclusive && value > 0;\n  }\n}\n";
    expect(findJsdocDrift(text)).toEqual([{ start: 2, end: 5, symbol: "Range.contains", detail: "parameter inclusive is not documented" }]);
  });

  it("matches a destructured parameter by the root name the JSDoc uses and leaves out its sub-properties", () => {
    const text =
      "/**\n * Starts.\n * @param settings the settings\n * @param settings.port the port\n * @param ghots a typo\n */\nexport function start({ port }: { port: number }, ghost: boolean): number {\n  return ghost ? port : 0;\n}\n";
    expect(findJsdocDrift(text)).toEqual([
      { start: 1, end: 6, symbol: "start", detail: "@param ghots matches no parameter" },
      { start: 1, end: 6, symbol: "start", detail: "parameter ghost is not documented" },
    ]);
  });
});

const EXISTS = (): boolean => true;

describe("findStaleReferences", () => {
  it("reports a function call in an inline code span that no declaration names, on its line", () => {
    const markdown = "# Demo\n\nCall `renderTable()` and `drawChart()` here.\n";
    expect(findStaleReferences(markdown, new Set(["renderTable"]), EXISTS)).toEqual([
      { line: 3, detail: "`drawChart()` is not declared in source" },
    ]);
  });

  it("reports a PascalCase name that no declaration names, and leaves out other words in code spans", () => {
    const markdown = "The `UserRecord` and `OrderBook` types, `npm`, `MAX_SIZE` and `a b`.\n";
    expect(findStaleReferences(markdown, new Set(["UserRecord"]), EXISTS)).toEqual([
      { line: 1, detail: "`OrderBook` is not declared in source" },
    ]);
  });

  it("reports a relative .ts, .js or .mts path for which the file does not exist", () => {
    const markdown = "See `src/a.ts`, `src/b.ts`, `lib/c.js`, `lib/d.mts`, `notes.txt` and `src/e.json`.\n";
    expect(findStaleReferences(markdown, new Set(), (path) => path === "src/a.ts")).toEqual([
      { line: 1, detail: "`src/b.ts` does not exist" },
      { line: 1, detail: "`lib/c.js` does not exist" },
      { line: 1, detail: "`lib/d.mts` does not exist" },
    ]);
  });

  it("leaves out fenced code blocks", () => {
    const markdown = "Call `gone()`.\n\n```ts\n`vanished()`\n```\n~~~\n`missing()`\n~~~\nThen `later()`.\n";
    expect(findStaleReferences(markdown, new Set(), EXISTS)).toEqual([
      { line: 1, detail: "`gone()` is not declared in source" },
      { line: 9, detail: "`later()` is not declared in source" },
    ]);
  });
});

describe("declaredNames", () => {
  it("lists the functions, classes, methods, interfaces, types, enums and variables a source text declares", () => {
    const text = [
      "export function renderTable(): void {}",
      "export class Printer { print(): void {} }",
      "interface UserRecord { name: string }",
      "type AccountKind = 'free';",
      "enum Plan { Basic }",
      "export const DefaultLimits = { users: 5 };",
      "",
    ].join("\n");
    expect([...declaredNames(text)].sort()).toEqual(["AccountKind", "DefaultLimits", "Plan", "Printer", "UserRecord", "print", "renderTable"]);
  });
});
