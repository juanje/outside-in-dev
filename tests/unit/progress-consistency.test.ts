import { describe, expect, it } from "vitest";
import { checkProgressConsistency } from "../../src/artifacts/consistency.js";
import type { Progress } from "../../src/artifacts/progress.js";

describe("checkProgressConsistency", () => {
  it("reports a focus on a feature that is not in progress", () => {
    const progress: Progress = {
      current_focus: "FR-X-01",
      features: [{ id: "FR-X-01", title: "Login", status: "pending" }],
    };
    expect(checkProgressConsistency(progress, [])).toEqual([
      { feature: "FR-X-01", kind: "focused but status is pending" },
    ]);
  });

  it("reports a focus on a feature that is not tracked", () => {
    const progress: Progress = { current_focus: "FR-X-09", features: [] };
    expect(checkProgressConsistency(progress, [])).toEqual([
      { feature: "FR-X-09", kind: "focused but not tracked" },
    ]);
  });

  it("reports each scenario of a done feature that does not pass", () => {
    const progress: Progress = {
      current_focus: null,
      features: [
        {
          id: "FR-X-01",
          title: "Login",
          status: "done",
          scenarios: [
            { name: "Working login", bdd: "pass" },
            { name: "Broken login", bdd: "fail" },
          ],
        },
      ],
    };
    const scenarios = [{ name: "Working login", tags: ["@FR-X-01"] }, { name: "Broken login", tags: ["@FR-X-01"] }];
    expect(checkProgressConsistency(progress, scenarios)).toEqual([
      { feature: "FR-X-01", scenario: "Broken login", kind: "done but scenario is fail" },
    ]);
  });

  it("reports a scenario tagged with a done feature that it does not record, but not for a feature in progress", () => {
    const progress: Progress = {
      current_focus: null,
      features: [
        { id: "FR-X-01", title: "Login", status: "done", scenarios: [{ name: "Working login", bdd: "pass" }] },
        { id: "FR-X-02", title: "Logout", status: "in_progress", cycle_step: "bdd_red", scenarios: [] },
      ],
    };
    const scenarios = [
      { name: "Working login", tags: ["@FR-X-01"] },
      { name: "Forgotten login", tags: ["@FR-X-01"] },
      { name: "Planned logout", tags: ["@FR-X-02"] },
    ];
    expect(checkProgressConsistency(progress, scenarios)).toEqual([
      { feature: "FR-X-01", scenario: "Forgotten login", kind: "done but scenario is not recorded" },
    ]);
  });

  it("reports a done or started feature that no scenario is tagged with", () => {
    const progress: Progress = {
      current_focus: null,
      features: [
        { id: "FR-X-01", title: "Login", status: "done", scenarios: [] },
        { id: "FR-X-02", title: "Logout", status: "in_progress", cycle_step: "tdd_red", scenarios: [] },
        { id: "FR-X-03", title: "Signup", status: "in_progress", cycle_step: "bdd_red", scenarios: [] },
      ],
    };
    const scenarios = [{ name: "Tagged logout", tags: ["@wip", "@FR-X-02"] }];
    expect(checkProgressConsistency(progress, scenarios)).toEqual([
      { feature: "FR-X-01", kind: "started but no feature file tags it" },
      { feature: "FR-X-03", kind: "started but no feature file tags it" },
    ]);
  });

  it("does not require a feature file for a feature that is only selected", () => {
    const progress: Progress = {
      current_focus: "FR-X-01",
      features: [{ id: "FR-X-01", title: "Login", status: "in_progress", cycle_step: "select", scenarios: [] }],
    };
    expect(checkProgressConsistency(progress, [])).toEqual([]);
  });

  it("reports a recorded scenario that no scenario tagged with the feature has", () => {
    const progress: Progress = {
      current_focus: "FR-X-01",
      features: [
        {
          id: "FR-X-01",
          title: "Login",
          status: "in_progress",
          cycle_step: "tdd_red",
          scenarios: [
            { name: "Own login", bdd: "pass" },
            { name: "Renamed login", bdd: "fail" },
            { name: "Borrowed login", bdd: "fail" },
          ],
        },
      ],
    };
    const scenarios = [
      { name: "Own login", tags: ["@FR-X-01"] },
      { name: "Borrowed login", tags: ["@FR-X-02"] },
    ];
    expect(checkProgressConsistency(progress, scenarios)).toEqual([
      { feature: "FR-X-01", scenario: "Renamed login", kind: "recorded scenario is in no feature file tagged with the feature" },
      { feature: "FR-X-01", scenario: "Borrowed login", kind: "recorded scenario is in no feature file tagged with the feature" },
    ]);
  });
});
