import { describe, expect, it } from "vitest";
import { recordCheckpoint } from "../../src/artifacts/checkpoint.js";
import { type FeatureProgress } from "../../src/artifacts/progress.js";
import { loadProjectPaths } from "../../src/artifacts/project-paths.js";
import { clearRevise, readRevise, recordRevise, requireReviseExit } from "../../src/artifacts/revise-record.js";
import { commitAll } from "./git-fixture.js";
import { dir, REAL_PROCESS_TIMEOUT_MS, useTempDir, write } from "./temp-project.js";

useTempDir();

const ID = "FR-X-01";
const FEATURE_FILE = "features/x.feature";
const scenario = (name: string, step = "Given a thing") => `  Scenario: ${name}\n    ${step}\n`;
const featureText = (...scenarios: string[]) => `@${ID}\nFeature: Alpha\n\n${scenarios.join("\n")}`;
const progressOf = (...names: string[]): FeatureProgress => ({ id: ID, title: "Alpha", status: "in_progress", cycle_step: "bdd_red", scenarios: names.map((name) => ({ name, bdd: "pending" })) });
const ran = (...names: string[]) => names.map((name) => ({ feature: ID, name }));

function greenRan(...names: string[]): void {
  recordCheckpoint(dir, { step: "tdd_green", feature: ID, verify: { kind: "green", target: "all" }, external: false, date: new Date(0), scenarios: ran(...names) });
}

/** A committed project with a feature file of the scenarios "Alpha works" and "Beta works", revised at that point. */
function revisedProject(): FeatureProgress {
  write(FEATURE_FILE, featureText(scenario("Alpha works"), scenario("Beta works")));
  write("src/code.ts", "export const code = 1;\n");
  commitAll();
  const feature = progressOf("Alpha works", "Beta works");
  recordRevise(dir, loadProjectPaths(dir), feature);
  return feature;
}

describe("the revise record", () => {
  it("keeps the name, text and tags of each scenario of the feature, those only registered included", { timeout: REAL_PROCESS_TIMEOUT_MS }, () => {
    write(FEATURE_FILE, featureText(scenario("Alpha works")));
    commitAll();
    recordRevise(dir, loadProjectPaths(dir), progressOf("Alpha works", "Registered only"));
    const scenarios = readRevise(dir, ID)?.scenarios;
    expect(scenarios?.map(({ name, tags }) => ({ name, tags }))).toEqual([
      { name: "Alpha works", tags: [`@${ID}`] },
      { name: "Registered only", tags: [] },
    ]);
    expect(scenarios?.[0]?.text).toContain("Alpha works");
  });

  it("is forgotten by clearRevise", { timeout: REAL_PROCESS_TIMEOUT_MS }, () => {
    revisedProject();
    clearRevise(dir, ID);
    expect(readRevise(dir, ID)).toBeUndefined();
  });
});

describe("leaving bdd_red for quality_gate after a revise", () => {
  it("is refused without a revise record, and says a revise is needed", { timeout: REAL_PROCESS_TIMEOUT_MS }, () => {
    write(FEATURE_FILE, featureText(scenario("Alpha works")));
    commitAll();
    expect(() => requireReviseExit(dir, loadProjectPaths(dir), progressOf("Alpha works"))).toThrow(/no revise record/);
  });

  it("is allowed when scenarios were only removed and a green ran the rest", { timeout: REAL_PROCESS_TIMEOUT_MS }, () => {
    revisedProject();
    write(FEATURE_FILE, featureText(scenario("Alpha works")));
    greenRan("Alpha works");
    expect(() => requireReviseExit(dir, loadProjectPaths(dir), progressOf("Alpha works"))).not.toThrow();
  });

  it("is refused when a scenario was added, and names it", { timeout: REAL_PROCESS_TIMEOUT_MS }, () => {
    revisedProject();
    write(FEATURE_FILE, featureText(scenario("Alpha works"), scenario("Beta works"), scenario("Gamma works")));
    greenRan("Alpha works", "Beta works", "Gamma works");
    expect(() => requireReviseExit(dir, loadProjectPaths(dir), progressOf("Alpha works", "Beta works", "Gamma works"))).toThrow(/"Gamma works".*added/);
  });

  it("is refused when something changed after the green, naming the file and the green to run", { timeout: REAL_PROCESS_TIMEOUT_MS }, () => {
    revisedProject();
    greenRan("Alpha works", "Beta works");
    write("docs/note.md", "changed\n");
    expect(() => requireReviseExit(dir, loadProjectPaths(dir), progressOf("Alpha works", "Beta works"))).toThrow(/docs\/note\.md.*oid verify green features\/x\.feature:4 features\/x\.feature:7/);
  });
});
