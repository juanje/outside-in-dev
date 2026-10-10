import { describe, expect, it } from "vitest";
import { failureDetail, OUTPUT_LIMIT } from "../../src/artifacts/red-classification.js";

describe("failureDetail", () => {
  it("names the failing step and shows the output the scenario recorded, indented under its heading", () => {
    const failure = { kind: "error" as const, message: "AssertionError: 1 !== 3", step: "features/a.feature:5 When it is shouted", output: "first line\nsecond line" };
    expect(failureDetail(failure)).toBe("failing step: features/a.feature:5 When it is shouted\noutput the scenario recorded:\n  first line\n  second line");
  });

  it("keeps the end of an output longer than the limit and says that the beginning is left out", () => {
    const output = `the start\n${"x".repeat(OUTPUT_LIMIT)}\nthe end`;
    const detail = failureDetail({ kind: "error", message: "boom", step: "features/a.feature:5 When it is shouted", output });
    expect(detail).toContain("the end");
    expect(detail).not.toContain("the start");
    expect(detail).toContain("  (earlier output left out)");
    expect(detail.length).toBeLessThan(OUTPUT_LIMIT + 200);
  });
});
