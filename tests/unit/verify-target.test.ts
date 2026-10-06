import { describe, expect, it } from "vitest";
import { ProgressError } from "../../src/artifacts/progress.js";
import { parseUnitTarget } from "../../src/artifacts/verify-target.js";

describe("parseUnitTarget", () => {
  it("splits the test file from the test name at the first ' > '", () => {
    expect(parseUnitTarget("tests/unit/a.test.ts > parses a > b")).toEqual({ file: "tests/unit/a.test.ts", name: "parses a > b" });
  });

  it("refuses a target without a test name, showing the expected form", () => {
    expect(() => parseUnitTarget("tests/unit/a.test.ts")).toThrow(new ProgressError('expected "<test file> > <test name>", got "tests/unit/a.test.ts"'));
  });
});
