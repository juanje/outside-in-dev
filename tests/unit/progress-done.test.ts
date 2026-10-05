import { describe, expect, it } from "vitest";
import { completeFeature } from "../../src/artifacts/progress.js";

const STARTED = {
  id: "FR-X-01",
  title: "Alpha",
  status: "in_progress",
  cycle_step: "quality_gate",
  scenarios: [
    { name: "S1", bdd: "pass" },
    { name: "S2", bdd: "pass" },
  ],
};

describe("completeFeature", () => {
  it("marks the feature done, drops the cycle step and keeps the scenarios", () => {
    expect(completeFeature(STARTED)).toEqual({
      id: "FR-X-01",
      title: "Alpha",
      status: "done",
      scenarios: STARTED.scenarios,
    });
  });

  it("rejects a feature without scenarios", () => {
    const started = { ...STARTED, scenarios: [] };
    expect(() => completeFeature(started)).toThrow(/FR-X-01/);
  });

  it("rejects a feature and names every scenario that does not pass", () => {
    const started = {
      ...STARTED,
      scenarios: [
        { name: "S1", bdd: "pass" },
        { name: "S2", bdd: "fail" },
        { name: "S3", bdd: "pending" },
      ],
    };
    expect(() => completeFeature(started)).toThrow(/S2.*S3/);
    expect(() => completeFeature(started)).not.toThrow(/S1/);
  });
});
