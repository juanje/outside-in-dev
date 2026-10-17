import { describe, expect, it } from "vitest";
import { rolledBack } from "../../src/orchestrator/run-refactor.js";

describe("a refactor that is rolled back", () => {
  it("says it was rolled back, lists what it broke as the evidence, and says where its findings wait", () => {
    expect(rolledBack(["the finding magic_value src/a.ts:3 is still there", "unit tests/unit/a.test.ts > adds: AssertionError"])).toEqual({
      failed: "the refactor is rolled back",
      evidence: "the finding magic_value src/a.ts:3 is still there\nunit tests/unit/a.test.ts > adds: AssertionError",
      next: "the findings wait for the feature refactor (FR_REFACTOR), which fixes them",
    });
  });
});
