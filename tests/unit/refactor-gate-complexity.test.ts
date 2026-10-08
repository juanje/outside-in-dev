import { describe, expect, it } from "vitest";
import { complexityProblem } from "../../src/orchestrator/refactor-gate.js";

const SIMPLE = "export function a(x: boolean): number {\n  return x ? 1 : 0;\n}\n";
const BRANCHING = "export function a(x: boolean): number {\n  if (x) {\n    return x && x ? 1 : 0;\n  }\n  return 0;\n}\n";

describe("the complexity after a refactor", () => {
  it("is a problem when the touched files are more complex than before", () => {
    expect(complexityProblem([{ before: SIMPLE, after: BRANCHING }])).toBe("the code is more complex than before (2 -> 4)");
  });

  it("is no problem when it stays or goes down", () => {
    expect(complexityProblem([{ before: BRANCHING, after: SIMPLE }, { before: SIMPLE, after: SIMPLE }])).toBeUndefined();
  });
});
