import { describe, expect, it } from "vitest";
import { ProgressError } from "../../src/artifacts/progress.js";
import { parseBddTarget, parseUnitTarget } from "../../src/artifacts/verify-target.js";

describe("parseUnitTarget", () => {
  it("splits the test file from the test name at the first ' > '", () => {
    expect(parseUnitTarget("tests/unit/a.test.ts > parses a > b")).toEqual({ file: "tests/unit/a.test.ts", name: "parses a > b" });
  });

  it("refuses a target without a test name, showing the expected form", () => {
    expect(() => parseUnitTarget("tests/unit/a.test.ts")).toThrow(new ProgressError('expected "<test file> > <test name>", got "tests/unit/a.test.ts"'));
  });
});

describe("parseBddTarget", () => {
  it("reads a feature file and the line of a scenario, and leaves a unit target alone", () => {
    expect([parseBddTarget("features/a.feature:12"), parseBddTarget("tests/unit/a.test.ts > b")]).toEqual([{ file: "features/a.feature", line: 12 }, undefined]);
  });
});
