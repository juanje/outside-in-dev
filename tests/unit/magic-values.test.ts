import { describe, expect, it } from "vitest";
import { findMagicNumbers, findRepeatedStrings } from "../../src/artifacts/magic-values.js";

const NO_IGNORED: number[] = [];

describe("findMagicNumbers", () => {
  it("reports a numeric literal with the lines it spans and its value", () => {
    const text = "export function isTooLong(length: number): boolean {\n  return length > 42;\n}\n";
    expect(findMagicNumbers(text, NO_IGNORED)).toEqual([{ start: 2, end: 2, detail: "magic number 42" }]);
  });

  it("leaves out the values that are ignored, compared by value", () => {
    const text = "export const sum = (n: number) => n + 0 + 1 + 1.0 + 7;\n";
    expect(findMagicNumbers(text, [0, 1])).toEqual([{ start: 1, end: 1, detail: "magic number 7" }]);
  });

  it("reads a minus sign as part of the number", () => {
    const text = "export const f = (n: number) => n < -40 || n > -1;\n";
    expect(findMagicNumbers(text, [-1])).toEqual([{ start: 1, end: 1, detail: "magic number -40" }]);
  });

  it("leaves out the direct initializer of a const, which is the named constant", () => {
    const text = "const MAX = 5;\nconst MIN = -20;\nexport const list = [8];\nexport let level = 9;\n";
    expect(findMagicNumbers(text, NO_IGNORED)).toEqual([
      { start: 3, end: 3, detail: "magic number 8" },
      { start: 4, end: 4, detail: "magic number 9" },
    ]);
  });

  it("leaves out the initializers of enum members", () => {
    const text = "export enum Level {\n  Low = 10,\n  High = -20,\n}\nexport let level = 9;\n";
    expect(findMagicNumbers(text, NO_IGNORED)).toEqual([{ start: 5, end: 5, detail: "magic number 9" }]);
  });

  it("leaves out literal types", () => {
    const text = "export type Port = 8080 | -5;\nexport let level = 9;\n";
    expect(findMagicNumbers(text, NO_IGNORED)).toEqual([{ start: 2, end: 2, detail: "magic number 9" }]);
  });
});

describe("findRepeatedStrings", () => {
  it("reports a string that repeats enough times once, at its first occurrence, with the other occurrences", () => {
    const files = [
      { file: "src/b.ts", text: 'export const isIdle = (s: string) => s !== "pending";\nexport const isOpen = (s: string) => s === "pending";\n' },
      { file: "src/a.ts", text: 'export const isReady = (s: string) => s === "pending";\n' },
    ];
    expect(findRepeatedStrings(files, 3)).toEqual([
      {
        category: "magic_value",
        file: "src/a.ts",
        range: { start: 1, end: 1 },
        detail: 'string "pending" repeated 3 times',
        related: [
          { file: "src/b.ts", range: { start: 1, end: 1 } },
          { file: "src/b.ts", range: { start: 2, end: 2 } },
        ],
      },
    ]);
  });

  it("does not count the empty string", () => {
    const files = [{ file: "src/a.ts", text: 'export const f = ["", "", "", "x", "x", "x"];\n' }];
    expect(findRepeatedStrings(files, 3).map(({ detail }) => detail)).toEqual(['string "x" repeated 3 times']);
  });

  it("does not count the direct initializer of a const", () => {
    const files = [{ file: "src/a.ts", text: 'const A = "k";\nconst B = "k";\nconst C = "k";\nexport const list = ["x", "x", "x"];\n' }];
    expect(findRepeatedStrings(files, 3).map(({ detail }) => detail)).toEqual(['string "x" repeated 3 times']);
  });

  it("does not count string literal types", () => {
    const files = [{ file: "src/a.ts", text: 'export type A = "k";\nexport type B = "k" | "k";\nexport const list = ["x", "x", "x"];\n' }];
    expect(findRepeatedStrings(files, 3).map(({ detail }) => detail)).toEqual(['string "x" repeated 3 times']);
  });

  it("does not count import and export specifiers", () => {
    const files = [{ file: "src/a.ts", text: 'import { a } from "k";\nimport "k";\nexport * from "k";\nexport { b } from "k";\nexport const list = ["x", "x", "x"];\n' }];
    expect(findRepeatedStrings(files, 3).map(({ detail }) => detail)).toEqual(['string "x" repeated 3 times']);
  });

  it("does not count object property keys", () => {
    const files = [{ file: "src/a.ts", text: 'export const a = { "k": 1 };\nexport const b = { "k": 2 };\nexport const c = { "k": 3, other: "k" };\nexport const list = ["x", "x", "x"];\n' }];
    expect(findRepeatedStrings(files, 3).map(({ detail }) => detail)).toEqual(['string "x" repeated 3 times']);
  });

  it("does not report a string that repeats fewer times than the minimum", () => {
    const files = [{ file: "src/a.ts", text: 'export const list = ["x", "x", "x", "y", "y"];\n' }];
    expect(findRepeatedStrings(files, 3).map(({ detail }) => detail)).toEqual(['string "x" repeated 3 times']);
  });
});
