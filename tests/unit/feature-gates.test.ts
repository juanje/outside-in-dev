import { describe, expect, it } from "vitest";
import { featureProblem } from "../../src/orchestrator/feature-gates.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

describe("the gates of a written feature file", () => {
  it("names the file that does not parse", () => {
    write("features/a.feature", "this is not gherkin\n");
    expect(featureProblem(dir, "FR-A-01", ["features/a.feature"], ["FR-A-01"])).toMatch(/^features\/a\.feature does not parse: /);
  });

  it("says when the feature files hold no scenario", () => {
    write("features/a.feature", "@FR-A-01\nFeature: Nothing\n");
    expect(featureProblem(dir, "FR-A-01", ["features/a.feature"], ["FR-A-01"])).toBe("the feature files have no scenario");
  });

  it("names a scenario that is not traced to the requirement", () => {
    write("features/a.feature", "Feature: Other\n  @FR-A-02\n  Scenario: Other\n    Given a cart\n");
    expect(featureProblem(dir, "FR-A-01", ["features/a.feature"], ["FR-A-01", "FR-A-02"])).toBe('scenario "Other" of features/a.feature is not traced to FR-A-01');
  });

  it("names a requirement tag that SPEC.md does not define", () => {
    write("features/a.feature", "@FR-A-01\nFeature: One\n  @NFR-09\n  Scenario: One\n    Given a cart\n");
    expect(featureProblem(dir, "FR-A-01", ["features/a.feature"], ["FR-A-01"])).toBe("NFR-09 is not in SPEC.md");
  });
});
