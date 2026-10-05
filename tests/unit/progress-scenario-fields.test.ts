import { describe, expect, it } from "vitest";
import { validateProgress } from "../../src/artifacts/progress.js";

describe("validateProgress scenario fields", () => {
  it("reports an unknown field inside a scenario with its path", () => {
    const document = {
      current_focus: null,
      features: [
        {
          id: "FR-X-01",
          title: "A",
          status: "in_progress",
          cycle_step: "select",
          scenarios: [{ name: "S1", bdd: "pass", note: "x" }],
        },
      ],
    };
    expect(validateProgress(document)).toEqual(["features[0].scenarios[0].note: unknown field"]);
  });
});
