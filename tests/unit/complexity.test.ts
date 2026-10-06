import { describe, expect, it } from "vitest";
import { findComplexFunctions } from "../../src/artifacts/complexity.js";

const LIMITS = { max_cyclomatic: 2, max_depth: 4 };

const NESTED_FIVE = [
  "function nest(a: boolean): number {",
  "  if (a) {",
  "    if (a) {",
  "      if (a) {",
  "        if (a) {",
  "          if (a) {",
  "            return 1;",
  "          }",
  "        }",
  "      }",
  "    }",
  "  }",
  "  return 0;",
  "}",
].join("\n");

describe("findComplexFunctions", () => {
  it("reports a function whose cyclomatic complexity is above the limit, with symbol, lines and detail", () => {
    const text = [
      "export function pick(a: number): number {",
      "  if (a > 1) return 1;",
      "  if (a > 2) return 2;",
      "  return 3;",
      "}",
    ].join("\n");
    expect(findComplexFunctions(text, LIMITS)).toEqual([
      { symbol: "pick", start: 1, end: 5, detail: "cyclomatic complexity 3 > 2" },
    ]);
  });

  it("reports a function nested deeper than the limit, with the depth and the limit", () => {
    expect(findComplexFunctions(NESTED_FIVE, { max_cyclomatic: 10, max_depth: 4 })).toEqual([
      { symbol: "nest", start: 1, end: 14, detail: "nesting depth 5 > 4" },
    ]);
  });

  it("reports both measures when a function is above both limits", () => {
    expect(findComplexFunctions(NESTED_FIVE, { max_cyclomatic: 2, max_depth: 4 })).toEqual([
      { symbol: "nest", start: 1, end: 14, detail: "cyclomatic complexity 6 > 2; nesting depth 5 > 4" },
    ]);
  });

  it("counts if, every loop, case but not default, catch, conditional expressions and logical operators", () => {
    const text = [
      "function everything(items: number[], flag: boolean, fallback?: number): number {",
      "  let total = 0;",
      "  if (flag) total += 1;",
      "  for (let i = 0; i < 2; i++) total += i;",
      "  for (const item of items) total += item;",
      "  for (const key in items) total += key.length;",
      "  while (total < 0) total += 1;",
      "  do {",
      "    total += 1;",
      "  } while (total < 0);",
      "  switch (total) {",
      "    case 1:",
      "      break;",
      "    case 2:",
      "      break;",
      "    default:",
      "      total += 3;",
      "  }",
      "  try {",
      "    total += 1;",
      "  } catch {",
      "    total += 2;",
      "  }",
      "  return flag ? (total && fallback) || (fallback ?? 0) : 0;",
      "}",
    ].join("\n");
    expect(findComplexFunctions(text, { max_cyclomatic: 13, max_depth: 99 })).toEqual([
      { symbol: "everything", start: 1, end: 25, detail: "cyclomatic complexity 14 > 13" },
    ]);
  });

  it("measures a nested function on its own and leaves it out of the function around it", () => {
    const text = [
      "function outer(a: number): number {",
      "  if (a > 0) a += 1;",
      "  if (a > 1) a += 1;",
      "  function inner(b: number): number {",
      "    if (b > 0) return 1;",
      "    if (b > 1) return 2;",
      "    if (b > 2) return 3;",
      "    if (b > 3) return 4;",
      "    return 5;",
      "  }",
      "  return inner(a);",
      "}",
    ].join("\n");
    expect(findComplexFunctions(text, { max_cyclomatic: 3, max_depth: 99 })).toEqual([
      { symbol: "inner", start: 4, end: 10, detail: "cyclomatic complexity 5 > 3" },
    ]);
  });

  it("names methods Class.method, arrow functions after their variable and other functions <anonymous>", () => {
    const text = [
      "export class Router {",
      "  route(a: boolean): number {",
      "    return a ? 1 : 2;",
      "  }",
      "}",
      "export const pick = (a: boolean) => (a ? 1 : 2);",
      "export const doubled = [1, 2].map((n) => (n > 1 ? n : 0));",
    ].join("\n");
    expect(findComplexFunctions(text, { max_cyclomatic: 1, max_depth: 99 })).toEqual([
      { symbol: "Router.route", start: 2, end: 4, detail: "cyclomatic complexity 2 > 1" },
      { symbol: "pick", start: 6, end: 6, detail: "cyclomatic complexity 2 > 1" },
      { symbol: "<anonymous>", start: 7, end: 7, detail: "cyclomatic complexity 2 > 1" },
    ]);
  });

  it("nests blocks of loops, switch and try as well as if", () => {
    const text = [
      "function deep(items: number[]): void {",
      "  for (const a of items) {",
      "    while (a > 0) {",
      "      switch (a) {",
      "        case 1:",
      "          try {",
      "            console.log(a);",
      "          } finally {",
      "            console.log(items);",
      "          }",
      "      }",
      "    }",
      "  }",
      "}",
    ].join("\n");
    expect(findComplexFunctions(text, { max_cyclomatic: 99, max_depth: 3 })).toEqual([
      { symbol: "deep", start: 1, end: 14, detail: "nesting depth 4 > 3" },
    ]);
  });

  it("does not nest an else if deeper than the if it continues", () => {
    const text = [
      "function branch(a: number): number {",
      "  if (a === 1) {",
      "    return 1;",
      "  } else if (a === 2) {",
      "    return 2;",
      "  } else if (a === 3) {",
      "    return 3;",
      "  }",
      "  return 0;",
      "}",
    ].join("\n");
    expect(findComplexFunctions(text, { max_cyclomatic: 99, max_depth: 0 })).toEqual([
      { symbol: "branch", start: 1, end: 10, detail: "nesting depth 1 > 0" },
    ]);
  });
});
