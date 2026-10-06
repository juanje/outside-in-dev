import { describe, expect, it } from "vitest";
import { findCommentedOutCode } from "../../src/artifacts/commented-out-code.js";

describe("findCommentedOutCode", () => {
  it("reports consecutive line comments that parse as code, with the lines they span", () => {
    const text = "export function total(): number {\n  // const old = 1;\n  // return old + 1;\n  return 2;\n}\n";
    expect(findCommentedOutCode(text)).toEqual([{ start: 2, end: 3 }]);
  });

  it("reports nothing for a file without comments", () => {
    expect(findCommentedOutCode("export const value = 1;\n")).toEqual([]);
  });

  it("judges each run of consecutive comment lines on its own", () => {
    const text = "// Adds the items.\nexport function add(): number {\n  // const a = 1;\n  // a.run();\n  return 2;\n}\n";
    expect(findCommentedOutCode(text)).toEqual([{ start: 3, end: 4 }]);
  });

  it("needs at least two comment lines", () => {
    expect(findCommentedOutCode("// const old = 1;\nexport const value = 2;\n")).toEqual([]);
  });

  it("does not take labels and lone identifiers, which is what short prose parses as, for code", () => {
    expect(findCommentedOutCode("// TODO: fix\n// NOTE: later\n// refactor\n// soon\nexport const value = 2;\n")).toEqual([]);
  });

  it("never takes directive comments for code, even when they parse as an expression", () => {
    expect(findCommentedOutCode("// eslint-disable\n// eslint-enable\nexport const value = 2;\n")).toEqual([]);
  });

  it("reports a block comment that is code, with the lines it spans", () => {
    const text = "/*\nconst legacy = compute();\nlegacy.run();\n*/\nexport const value = 1;\n";
    expect(findCommentedOutCode(text)).toEqual([{ start: 1, end: 4 }]);
  });

  it("never reports a JSDoc block, whatever its prose looks like", () => {
    const text = "/**\n * Registers a package. Doing so is unsafe, and offering it\n * for import produces a permanently broken install.\n */\nexport const value = 1;\n";
    expect(findCommentedOutCode(text)).toEqual([]);
  });

  it("takes prose that TypeScript parses as a broken statement for plain text, not for code", () => {
    const text = "// Offering it\n// for import x\nexport const value = 1;\n";
    expect(findCommentedOutCode(text)).toEqual([]);
  });
});
