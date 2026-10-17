import { describe, expect, it } from "vitest";

describe("rejection", () => {
  it("refuses a part that is empty or only spaces, and names it", async () => {
    const { rejection } = await import("../../src/artifacts/rejection.js");
    const whole = { failed: "the unit test fails", evidence: "expected 1 to be 2", next: "fix the code" };
    expect(() => rejection({ ...whole, failed: "" })).toThrow("failed");
    expect(() => rejection({ ...whole, evidence: "  \n" })).toThrow("evidence");
    expect(() => rejection({ ...whole, next: "" })).toThrow("next");
    expect(rejection(whole).next).toBe("fix the code");
  });
});

describe("renderRejection", () => {
  it("prints what failed on the first line, the evidence indented under its heading, and the next action", async () => {
    const { rejection, renderRejection } = await import("../../src/artifacts/rejection.js");
    const rejected = rejection({ failed: "the unit test passes at once", evidence: "tests/unit/cart.test.ts > adds a line\nexpected 1 to be 1", next: "test a behaviour the code does not have yet" });
    expect(renderRejection(rejected)).toBe(["the unit test passes at once", "Evidence:", "  tests/unit/cart.test.ts > adds a line", "  expected 1 to be 1", "Next: test a behaviour the code does not have yet"].join("\n"));
  });
});

describe("boundRendered", () => {
  it("cuts the evidence of a long rejection and keeps its first line and its next action", async () => {
    const { boundRendered, rejection, renderRejection } = await import("../../src/artifacts/rejection.js");
    const text = renderRejection(rejection({ failed: "the unit test fails", evidence: "e".repeat(500), next: "fix the code and run the test again" }));
    const bounded = boundRendered(text, 100);
    expect(bounded.split("\n")[0]).toBe("the unit test fails");
    expect(bounded.endsWith("\nNext: fix the code and run the test again")).toBe(true);
    expect(bounded).toContain("…");
    expect(bounded.length).toBeLessThanOrEqual(100);
    expect(boundRendered(text, 1000)).toBe(text);
  });
});
