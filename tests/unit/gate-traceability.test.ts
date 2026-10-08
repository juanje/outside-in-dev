import { describe, expect, it } from "vitest";
import { gateChecks } from "../../src/orchestrator/gate-checks.js";
import { EMPTY_BASELINE, gateProject } from "./gate-project.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

describe("the traceability check of the quality gate", () => {
  it("puts the violations the baseline does not hold to a person, and goes on to the suites when it holds them all", () => {
    const config = gateProject({}, { "features/legacy.feature": "Feature: Legacy\n  Scenario: Untagged\n    Given a cart\n" });
    const outcome = gateChecks(dir, config, EMPTY_BASELINE);
    expect(outcome).toEqual({ kind: "ask", check: "traceability", problems: [expect.stringContaining("features/legacy.feature")], output: expect.stringContaining("features/legacy.feature") });
    const held = outcome.kind === "ask" ? outcome.problems : [];
    expect(gateChecks(dir, config, { ...EMPTY_BASELINE, traceability: held })).toMatchObject({ kind: "ask", check: "unit" });
  });
});
