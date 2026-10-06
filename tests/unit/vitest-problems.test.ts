import { describe, expect, it } from "vitest";
import { normalizeVitestReport, unitProblems } from "../../src/artifacts/vitest-report.js";

const CWD = "/p";

const report = {
  testResults: [
    {
      name: "/p/tests/unit/a.test.ts",
      message: "",
      assertionResults: [
        { fullName: "a adds", title: "adds", status: "passed", failureMessages: [] },
        { fullName: "a subtracts", title: "subtracts", status: "failed", failureMessages: ["AssertionError: expected 1 to be 2\n    at /p/a.ts:1:1"] },
      ],
    },
    { name: "/p/tests/unit/b.test.ts", message: "Cannot find module '../../src/b.js'\nmore", assertionResults: [] },
  ],
};

describe("unitProblems", () => {
  it("lists each failing test with the first line of its failure, and each file that did not load, by path from the project", () => {
    expect(unitProblems(normalizeVitestReport(report), CWD)).toEqual([
      "unit tests/unit/a.test.ts > a subtracts: AssertionError: expected 1 to be 2",
      "unit tests/unit/b.test.ts: Cannot find module '../../src/b.js'",
    ]);
  });
});
