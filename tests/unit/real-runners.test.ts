import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REAL_RUNNER_SCENARIOS } from "../../features/support/real-runners.js";
import { listScenarios } from "../../src/artifacts/traceability.js";

const FEATURES = ["run-03", "run-04", "run-05", "run-06"].map((id) => ({ path: `features/${id}.feature`, text: readFileSync(`features/${id}.feature`, "utf8") }));
const listed = listScenarios(FEATURES);

describe("real-runner scenarios", () => {
  for (const [fr, name] of Object.entries(REAL_RUNNER_SCENARIOS)) {
    it(`${fr} names a scenario that exists once and carries its tag`, () => {
      const matches = listed.filter((scenario) => scenario.name === name);
      expect(matches).toHaveLength(1);
      expect(matches[0]!.tags).toContain(`@${fr}`);
    });
  }
});
