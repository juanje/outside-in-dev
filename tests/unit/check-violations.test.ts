import { describe, expect, it } from "vitest";
import { checkViolations } from "../../src/commands/check.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

describe("the violations of a project", () => {
  it("are the ones oid check reports, as a list a run can compare", () => {
    write("SPEC.md", "### FR-X-01: Alpha\n\nThe tool does alpha.\n");
    write("features/a.feature", "@FR-X-01\nFeature: Alpha\n  Scenario: Tagged\n    Given a cart\n");
    write("features/b.feature", "Feature: Beta\n  Scenario: Untagged\n    Given a cart\n");
    const violations = checkViolations(dir);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ check: "traceability", message: expect.stringContaining("features/b.feature") });
  });
});
