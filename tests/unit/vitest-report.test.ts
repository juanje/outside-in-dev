import { describe, expect, it } from "vitest";
import { ProgressError } from "../../src/artifacts/progress.js";
import { normalizeVitestReport, selectTest } from "../../src/artifacts/vitest-report.js";

const REPORT = {
  numTotalTests: 2,
  testResults: [
    {
      name: "/p/tests/unit/a.test.ts",
      status: "failed",
      message: "",
      assertionResults: [
        { ancestorTitles: ["math"], fullName: "math adds", title: "adds", status: "failed", failureMessages: ["AssertionError: expected 3 to be 4\n    at x"], meta: {} },
        { ancestorTitles: [], fullName: "subtracts", title: "subtracts", status: "passed", failureMessages: [] },
      ],
    },
    { name: "/p/tests/unit/b.test.ts", status: "failed", message: "Cannot find module '../../src/b.js' imported from '/p/tests/unit/b.test.ts'", assertionResults: [] },
  ],
};

describe("normalizeVitestReport", () => {
  it("gives each file with its load message and its tests with full name, title, status and failure messages", () => {
    expect(normalizeVitestReport(REPORT)).toEqual([
      {
        file: "/p/tests/unit/a.test.ts",
        message: "",
        tests: [
          { fullName: "math adds", title: "adds", status: "failed", failureMessages: ["AssertionError: expected 3 to be 4\n    at x"] },
          { fullName: "subtracts", title: "subtracts", status: "passed", failureMessages: [] },
        ],
      },
      { file: "/p/tests/unit/b.test.ts", message: "Cannot find module '../../src/b.js' imported from '/p/tests/unit/b.test.ts'", tests: [] },
    ]);
  });

  it("refuses a report that is not a vitest JSON report", () => {
    expect(() => normalizeVitestReport({ testResults: "none" })).toThrow(new ProgressError("the unit runner wrote a report that is not a vitest JSON report"));
  });
});

const test = (fullName: string, title: string) => ({ fullName, title, status: "failed", failureMessages: [] });

describe("selectTest", () => {
  it("selects the test whose full name is the given name", () => {
    const wanted = test("math adds", "adds");
    const files = [{ file: "a", message: "", tests: [test("adds", "adds"), wanted] }];
    expect(selectTest(files, "math adds")).toEqual({ kind: "found", test: wanted });
  });

  it("selects the test with the given title when no full name is that name", () => {
    const wanted = test("math adds", "adds");
    expect(selectTest([{ file: "a", message: "", tests: [test("subtracts", "subtracts"), wanted] }], "adds")).toEqual({ kind: "found", test: wanted });
  });

  it("reports every full name when several tests have the given title", () => {
    const files = [{ file: "a", message: "", tests: [test("formal greets", "greets"), test("informal greets", "greets"), test("other", "other")] }];
    expect(selectTest(files, "greets")).toEqual({ kind: "several", fullNames: ["formal greets", "informal greets"] });
  });

  it("finds no test when none has the given name or title", () => {
    expect(selectTest([{ file: "a", message: "", tests: [test("adds", "adds")] }], "greets")).toEqual({ kind: "none" });
  });
});
