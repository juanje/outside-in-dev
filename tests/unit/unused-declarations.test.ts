import { describe, expect, it } from "vitest";
import { unusedDeclarationFindings } from "../../src/artifacts/unused-declarations.js";

/** A diagnostic as the classic API of TypeScript 6.0.3 reports it with `noUnusedLocals`: the span is the name. */
function diagnosticAt(text: string, name: string, code: number) {
  return { code, start: text.indexOf(name), length: name.length, message: `'${name}' is declared but its value is never read.` };
}

describe("unusedDeclarationFindings", () => {
  it("turns the 'declared but never read' diagnostic (6133) into a finding named after the declaration, at its line", () => {
    const text = "export function total(items: number[]): number {\n  const unusedCount = items.length;\n  return 0;\n}\n";
    expect(unusedDeclarationFindings("src/total.ts", text, [diagnosticAt(text, "unusedCount", 6133)])).toEqual([
      { category: "dead_code", file: "src/total.ts", range: { start: 2, end: 2 }, symbol: "unusedCount", detail: "unused declaration" },
    ]);
  });

  it("ignores every other diagnostic, such as a name that cannot be found", () => {
    const text = "console.log(missing);\n";
    expect(unusedDeclarationFindings("src/a.ts", text, [diagnosticAt(text, "missing", 2304)])).toEqual([]);
  });

  it("reports an import declaration whose names are all unused once, without a symbol (6192)", () => {
    const text = 'import { a, b } from "./x.js";\nconsole.log(1);\n';
    const import_ = 'import { a, b } from "./x.js";';
    expect(unusedDeclarationFindings("src/a.ts", text, [diagnosticAt(text, import_, 6192)])).toEqual([
      { category: "dead_code", file: "src/a.ts", range: { start: 1, end: 1 }, detail: "unused imports" },
    ]);
  });

  it("reports a local type that is never used (6196) like any other unused declaration", () => {
    const text = "type Shape = { sides: number };\nconsole.log(1);\n";
    expect(unusedDeclarationFindings("src/a.ts", text, [diagnosticAt(text, "Shape", 6196)])).toEqual([
      { category: "dead_code", file: "src/a.ts", range: { start: 1, end: 1 }, symbol: "Shape", detail: "unused declaration" },
    ]);
  });

  it("names a lone unused import after the message, because TypeScript then reports the whole import declaration", () => {
    const text = 'import { readFileSync } from "node:fs";\nconsole.log(1);\n';
    const diagnostic = { code: 6133, start: 0, length: 39, message: "'readFileSync' is declared but its value is never read." };
    expect(unusedDeclarationFindings("src/a.ts", text, [diagnostic])).toEqual([
      { category: "dead_code", file: "src/a.ts", range: { start: 1, end: 1 }, symbol: "readFileSync", detail: "unused declaration" },
    ]);
  });
});
