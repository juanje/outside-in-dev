import { describe, expect, it } from "vitest";
import { isInsideSource } from "../../src/artifacts/source-roots.js";

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
