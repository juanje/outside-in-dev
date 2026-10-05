import { describe, expect, it } from "vitest";
import { checkTraceability, listScenarios } from "../../src/artifacts/traceability.js";

describe("checkTraceability", () => {
  it("reports a scenario that has no tags at all", () => {
    const text = ["Feature: Login", "", "  Scenario: Orphan login"].join("\n");
    expect(checkTraceability([{ path: "features/login.feature", text }], ["FR-X-01"])).toEqual([
      { file: "features/login.feature", scenario: "Orphan login", kind: "no @FR tag" },
    ]);
  });

  it("reports an FR tag that is not a known requirement, naming the tag", () => {
    const text = ["Feature: Login", "", "  @FR-X-01 @FR-X-99", "  Scenario: Ghost login"].join("\n");
    expect(checkTraceability([{ path: "features/login.feature", text }], ["FR-X-01"])).toEqual([
      { file: "features/login.feature", scenario: "Ghost login", kind: "unknown tag @FR-X-99" },
    ]);
  });

  it("counts a requirement tag inherited from the Feature", () => {
    const text = ["@FR-X-01", "Feature: Login", "", "  Scenario: Inherited login"].join("\n");
    expect(checkTraceability([{ path: "features/login.feature", text }], ["FR-X-01"])).toEqual([]);
  });

  it("does not count an NFR tag as a requirement tag", () => {
    const text = ["Feature: Speed", "", "  @NFR-01 @wip", "  Scenario: Fast start"].join("\n");
    expect(checkTraceability([{ path: "features/speed.feature", text }], ["NFR-01"])).toEqual([
      { file: "features/speed.feature", scenario: "Fast start", kind: "no @FR tag" },
    ]);
  });

  it("reports an NFR tag that is not a known requirement, naming the tag", () => {
    const text = ["Feature: Login", "", "  @FR-X-01 @NFR-42", "  Scenario: Slow login"].join("\n");
    expect(checkTraceability([{ path: "features/login.feature", text }], ["FR-X-01"])).toEqual([
      { file: "features/login.feature", scenario: "Slow login", kind: "unknown tag @NFR-42" },
    ]);
  });

  it("checks scenarios nested in a Rule", () => {
    const text = ["Feature: Login", "", "  Rule: Credentials", "", "    Scenario: Rule login"].join("\n");
    expect(checkTraceability([{ path: "features/login.feature", text }], ["FR-X-01"])).toEqual([
      { file: "features/login.feature", scenario: "Rule login", kind: "no @FR tag" },
    ]);
  });

  it("counts a requirement tag inherited from a Rule", () => {
    const text = ["Feature: Login", "", "  @FR-X-01", "  Rule: Credentials", "", "    Scenario: Rule login"].join("\n");
    expect(checkTraceability([{ path: "features/login.feature", text }], ["FR-X-01"])).toEqual([]);
  });
});

describe("listScenarios", () => {
  it("lists every scenario with its effective tags: Feature, Rule and its own", () => {
    const text = [
      "@FR-X-01",
      "Feature: Login",
      "",
      "  @wip",
      "  Scenario: Direct login",
      "",
      "  @FR-X-02",
      "  Rule: Credentials",
      "",
      "    @smoke",
      "    Scenario: Rule login",
    ].join("\n");
    expect(listScenarios([{ path: "features/login.feature", text }])).toEqual([
      { file: "features/login.feature", name: "Direct login", tags: ["@FR-X-01", "@wip"] },
      { file: "features/login.feature", name: "Rule login", tags: ["@FR-X-01", "@FR-X-02", "@smoke"] },
    ]);
  });
});
