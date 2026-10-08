import { describe, expect, it } from "vitest";
import { totalComplexity } from "../../src/artifacts/complexity.js";

describe("totalComplexity", () => {
  it("adds the cyclomatic complexity of every function of a source text", () => {
    const text = ["function a(x: boolean): number {", "  if (x) {", "    return 1;", "  }", "  return 0;", "}", "const b = (y: number) => (y && 1 ? 2 : 3);", ""].join("\n");
    expect(totalComplexity(text)).toBe(2 + 3);
  });
});
