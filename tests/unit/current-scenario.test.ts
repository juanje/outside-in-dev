import { describe, expect, it } from "vitest";
import { currentScenario } from "../../src/orchestrator/run-bdd-red.js";
import { gateProject } from "./gate-project.js";
import { dir, useTempDir, write, writeProgressFile } from "./temp-project.js";

useTempDir();

describe("the current scenario of a requirement", () => {
  it("rejects two scenarios that share a name, naming it and the files, and asks for a name of its own for each", () => {
    gateProject({});
    write("features/a.feature", "@FR-X-01\nFeature: A\n  Scenario: Pay\n    Given a cart\n");
    write("features/b.feature", "@FR-X-01\nFeature: B\n  Scenario: Pay\n    Given a cart\n");
    writeProgressFile({ current_focus: null, features: [{ id: "FR-X-01", title: "Alpha", status: "in_progress", cycle_step: "bdd_red", scenarios: [] }] });
    expect(currentScenario(dir, "FR-X-01")).toEqual({
      problem: {
        failed: 'FR-X-01: the scenario "Pay" is defined twice, and scenarios are told apart by their names',
        evidence: 'scenario "Pay" in features/a.feature:3 and features/b.feature:3',
        next: 'rename one of the scenarios "Pay" in its feature file, then run oid resume',
      },
    });
  });
});
