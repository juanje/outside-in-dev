import { describe, expect, it } from "vitest";
import { recordCheckpoint } from "../../src/artifacts/checkpoint.js";
import { type FeatureProgress } from "../../src/artifacts/progress.js";
import { loadProjectPaths } from "../../src/artifacts/project-paths.js";
import { recordRevise, requireReviseExit, scenarioText } from "../../src/artifacts/revise-record.js";
import { commitAll } from "./git-fixture.js";
import { FEATURE_FILE, featureText, ID, scenario } from "./revise-fixture.js";
import { dir, REAL_PROCESS_TIMEOUT_MS, useTempDir, write } from "./temp-project.js";

useTempDir();

const progressOf = (scenarios: { name: string; mutant?: { diff: string; text: string } }[]): FeatureProgress => ({
  id: ID,
  title: "Alpha",
  status: "in_progress",
  cycle_step: "bdd_red",
  scenarios: scenarios.map((entry) => ({ bdd: "pending", ...entry })),
});

/** A committed project revised with the scenario "Alpha works", then changed to "Given another thing" and run by a green. */
function revisedAndChanged(): { text: string } {
  write(FEATURE_FILE, featureText(scenario("Alpha works")));
  commitAll();
  recordRevise(dir, loadProjectPaths(dir), progressOf([{ name: "Alpha works" }]));
  write(FEATURE_FILE, featureText(scenario("Alpha works", "Given another thing")));
  recordCheckpoint(dir, { step: "tdd_green", feature: ID, verify: { kind: "green", target: "all" }, external: false, date: new Date(0), scenarios: [{ feature: ID, name: "Alpha works" }] });
  return { text: scenarioText(dir, loadProjectPaths(dir), progressOf([{ name: "Alpha works" }]), "Alpha works")! };
}

describe("scenarioText", () => {
  it("is the normalised text of the scenario as the feature file holds it now, and nothing for a scenario it does not hold", { timeout: REAL_PROCESS_TIMEOUT_MS }, () => {
    write(FEATURE_FILE, featureText(scenario("Alpha works")));
    const feature = progressOf([{ name: "Alpha works" }]);
    expect(scenarioText(dir, loadProjectPaths(dir), feature, "Alpha works")).toContain('"text":"a thing"');
    expect(scenarioText(dir, loadProjectPaths(dir), feature, "Missing")).toBeUndefined();
  });
});

describe("leaving bdd_red for quality_gate after a revise with changed scenarios", () => {
  it("is allowed when the scenario that changed has a mutant proved on its text now", { timeout: REAL_PROCESS_TIMEOUT_MS }, () => {
    const { text } = revisedAndChanged();
    expect(() => requireReviseExit(dir, loadProjectPaths(dir), progressOf([{ name: "Alpha works", mutant: { diff: "d", text } }]))).not.toThrow();
  });

  it("is refused when the scenario that changed has no mutant, and names it", { timeout: REAL_PROCESS_TIMEOUT_MS }, () => {
    revisedAndChanged();
    expect(() => requireReviseExit(dir, loadProjectPaths(dir), progressOf([{ name: "Alpha works" }]))).toThrow(/"Alpha works" changed and has no mutant/);
  });

  it("is refused when the mutant was proved on an earlier text of the scenario, and names it", { timeout: REAL_PROCESS_TIMEOUT_MS }, () => {
    revisedAndChanged();
    expect(() => requireReviseExit(dir, loadProjectPaths(dir), progressOf([{ name: "Alpha works", mutant: { diff: "d", text: "Scenario: Alpha works\n  Given a thing" } }]))).toThrow(
      /"Alpha works" changed after its mutant was proved/,
    );
  });
});
