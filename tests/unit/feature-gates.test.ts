import { describe, expect, it } from "vitest";
import { featureProblem } from "../../src/orchestrator/feature-gates.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

describe("the gates of a written feature file", () => {
  it("names the file that does not parse, the syntax error as the evidence, and asks for a feature file that parses", () => {
    write("features/a.feature", "this is not gherkin\n");
    expect(featureProblem(dir, "FR-A-01", ["features/a.feature"], ["FR-A-01"])).toEqual({
      failed: "features/a.feature does not parse",
      evidence: expect.stringContaining("expected: #EOF"),
      next: "fix the Gherkin syntax of features/a.feature so that it parses, then write the feature files again",
    });
  });

  it("says when the feature files hold no scenario, which files they are, and asks for one", () => {
    write("features/a.feature", "@FR-A-01\nFeature: Nothing\n");
    expect(featureProblem(dir, "FR-A-01", ["features/a.feature"], ["FR-A-01"])).toEqual({
      failed: "the feature files have no scenario",
      evidence: "feature files: features/a.feature",
      next: "write at least one scenario for FR-A-01 in a feature file",
    });
  });

  it("names a scenario that is not traced to the requirement, its tags as the evidence, and the tag to add", () => {
    write("features/a.feature", "Feature: Other\n  @FR-A-02\n  Scenario: Other\n    Given a cart\n");
    expect(featureProblem(dir, "FR-A-01", ["features/a.feature"], ["FR-A-01", "FR-A-02"])).toEqual({
      failed: 'scenario "Other" of features/a.feature is not traced to FR-A-01',
      evidence: "tags of the scenario: @FR-A-02",
      next: "tag the scenario or its feature with @FR-A-01",
    });
  });

  it("names a requirement tag that SPEC.md does not define, and the ids it does", () => {
    write("features/a.feature", "@FR-A-01\nFeature: One\n  @NFR-09\n  Scenario: One\n    Given a cart\n");
    expect(featureProblem(dir, "FR-A-01", ["features/a.feature"], ["FR-A-01"])).toEqual({
      failed: "NFR-09 is not in SPEC.md",
      evidence: "tag: @NFR-09",
      next: "use only the requirement ids that SPEC.md defines: FR-A-01",
    });
  });
});
