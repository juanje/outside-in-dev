import { describe, expect, it } from "vitest";
import { ProgressError } from "../../src/artifacts/progress.js";
import { parseBddTarget, parseUnitTarget, scenarioTarget } from "../../src/artifacts/verify-target.js";

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

describe("scenarioTarget", () => {
  const located = [
    { file: "features/a.feature", line: 4, name: "Adds", tags: [] },
    { file: "features/a.feature", line: 9, name: "Subtracts", tags: [] },
    { file: "features/b.feature", line: 3, name: "Subtracts", tags: [] },
  ];

  it("locates a scenario by its <feature>:<line>, or by its name when one scenario has it, and nothing otherwise", () => {
    expect([scenarioTarget("features/x.feature:7", located), scenarioTarget("Adds", located), scenarioTarget("tests/unit/a.test.ts > adds", located)]).toEqual([
      { file: "features/x.feature", line: 7 },
      { file: "features/a.feature", line: 4 },
      undefined,
    ]);
  });

  it("refuses a name that several scenarios have, naming their locations", () => {
    expect(() => scenarioTarget("Subtracts", located)).toThrow(
      new ProgressError('several scenarios are named "Subtracts"; give the location of one of them: features/a.feature:9, features/b.feature:3'),
    );
  });
});
