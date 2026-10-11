import { describe, expect, it } from "vitest";
import { tagWip } from "../../src/orchestrator/wip-tag.js";

const FEATURE = "@FR-A-01\nFeature: Pay\n  Scenario: First\n    Given a\n\n  Scenario: Second\n    Given b\n";

describe("tagWip", () => {
  it("puts a @wip line above the scenario that starts at the line, with the indentation of the scenario, and changes nothing else", () => {
    expect(tagWip(FEATURE, 3)).toBe("@FR-A-01\nFeature: Pay\n  @wip\n  Scenario: First\n    Given a\n\n  Scenario: Second\n    Given b\n");
    expect(tagWip(FEATURE, 6)).toBe("@FR-A-01\nFeature: Pay\n  Scenario: First\n    Given a\n\n  @wip\n  Scenario: Second\n    Given b\n");
  });
});
