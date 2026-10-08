import { describe, expect, it } from "vitest";
import { lintErrors } from "../../src/artifacts/lint-tools.js";

describe("the errors an ESLint JSON report holds", () => {
  it("are its error messages with their location, and no warning", () => {
    const report = JSON.stringify([
      { filePath: "/work/project/src/cart.ts", messages: [{ ruleId: "no-todo", severity: 2, message: "Unexpected TODO comment.", line: 4, column: 1 }, { ruleId: "no-console", severity: 1, message: "Unexpected console.", line: 5, column: 1 }] },
      { filePath: "/work/project/src/totals.ts", messages: [{ ruleId: null, severity: 2, message: "Parsing error", line: 1, column: 1 }] },
      { filePath: "/work/project/src/clean.ts", messages: [] },
    ]);
    expect(lintErrors(report, "/work/project")).toEqual([
      { kind: "lint", file: "src/cart.ts", line: 4, code: "no-todo", message: "Unexpected TODO comment." },
      { kind: "lint", file: "src/totals.ts", line: 1, code: "parse error", message: "Parsing error" },
    ]);
  });
});
