import { describe, expect, it } from "vitest";
import { isInsideCode, isInsideSource } from "../../src/artifacts/source-roots.js";

describe("isInsideSource", () => {
  it("is true for a path under the fixed directory of a source glob and false elsewhere", () => {
    expect(["src/a/b.js", "tests/b.js"].map((path) => isInsideSource(["src/**/*.ts"], path))).toEqual([true, false]);
  });

  it("keeps every directory before the first wildcard, and does not take a sibling directory with the same prefix", () => {
    expect(["lib/core/a.js", "lib/other.js", "lib/core2/a.js"].map((path) => isInsideSource(["lib/core/**"], path))).toEqual([true, false, false]);
  });

  it("takes the whole project when a glob starts with a wildcard", () => {
    expect(isInsideSource(["**/*.ts"], "anywhere/at/all.js")).toBe(true);
  });
});

describe("isInsideCode", () => {
  const paths = { source: ["lib/**/*.ts"], unit_tests: ["spec/unit/**/*.ts"], bdd_steps: ["spec/steps/**/*.ts"] };

  it("is true for a path under the source, the unit tests or the step definitions, and false elsewhere", () => {
    expect(["lib/a.ts", "spec/unit/a.ts", "spec/steps/a.ts", "docs/a.ts"].map((path) => isInsideCode(paths, path))).toEqual([true, true, true, false]);
  });
});
