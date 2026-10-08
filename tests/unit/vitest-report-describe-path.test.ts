import { describe, expect, it } from "vitest";
import { selectTest, type UnitFileResult } from "../../src/artifacts/vitest-report.js";

const FILES: UnitFileResult[] = [
  {
    file: "/p/tests/unit/a.test.ts",
    message: "",
    tests: [
      { fullName: "cart lines adds a line", title: "adds a line", status: "passed", failureMessages: [] },
      { fullName: "adds a line", title: "adds a line", status: "failed", failureMessages: ["boom"] },
    ],
  },
];

describe("selectTest with the describe path an agent reports", () => {
  it("finds the test whose describe titles and title are joined with ' > '", () => {
    expect(selectTest(FILES, "cart lines > adds a line")).toEqual({ kind: "found", test: FILES[0]!.tests[0] });
  });
});
