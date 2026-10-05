import { describe, expect, it } from "vitest";
import { ProgressError } from "../../src/artifacts/progress.js";
import { convertProgress } from "../../src/artifacts/progress-import.js";

describe("convertProgress", () => {
  it("turns blocked and deferred features into pending ones and lists them", () => {
    const { progress, notes } = convertProgress({
      current_focus: null,
      features: [
        { id: "FR-DEMO-01", title: "A", status: "blocked", scenarios: [] },
        { id: "FR-DEMO-02", title: "B", status: "deferred", scenarios: [] },
      ],
    });
    expect(progress.features.map((f) => f.status)).toEqual(["pending", "pending"]);
    expect(notes).toEqual([
      "FR-DEMO-01: status blocked converted to pending",
      "FR-DEMO-02: status deferred converted to pending",
    ]);
  });

  it("moves an in-progress feature at spec_review back to select and lists it", () => {
    const { progress, notes } = convertProgress({
      current_focus: null,
      features: [{ id: "FR-DEMO-01", title: "A", status: "in_progress", cycle_step: "spec_review", scenarios: [] }],
    });
    expect(progress.features[0]).toEqual({
      id: "FR-DEMO-01",
      title: "A",
      status: "in_progress",
      cycle_step: "select",
      scenarios: [],
    });
    expect(notes).toEqual(["FR-DEMO-01: cycle_step spec_review converted to select"]);
  });

  it("moves an in-progress feature at implementing to tdd_red and lists it", () => {
    const { progress, notes } = convertProgress({
      current_focus: null,
      features: [{ id: "FR-DEMO-01", title: "A", status: "in_progress", cycle_step: "implementing", scenarios: [] }],
    });
    expect(progress.features[0]!.cycle_step).toBe("tdd_red");
    expect(notes).toEqual(["FR-DEMO-01: cycle_step implementing converted to tdd_red"]);
  });

  it("moves an in-progress feature at bdd_green to quality_gate and lists it", () => {
    const { progress, notes } = convertProgress({
      current_focus: null,
      features: [{ id: "FR-DEMO-01", title: "A", status: "in_progress", cycle_step: "bdd_green", scenarios: [] }],
    });
    expect(progress.features[0]!.cycle_step).toBe("quality_gate");
    expect(notes).toEqual(["FR-DEMO-01: cycle_step bdd_green converted to quality_gate"]);
  });

  it("moves an in-progress feature at an unknown step to select and lists it", () => {
    const { progress, notes } = convertProgress({
      current_focus: null,
      features: [{ id: "FR-DEMO-01", title: "A", status: "in_progress", cycle_step: "polishing", scenarios: [] }],
    });
    expect(progress.features[0]!.cycle_step).toBe("select");
    expect(notes).toEqual(["FR-DEMO-01: cycle_step polishing converted to select"]);
  });

  it("removes the cycle step of a done feature without listing it when it says done", () => {
    const { progress, notes } = convertProgress({
      current_focus: null,
      features: [{ id: "FR-DEMO-01", title: "A", status: "done", cycle_step: "done", scenarios: [] }],
    });
    expect(progress.features[0]).toEqual({ id: "FR-DEMO-01", title: "A", status: "done", scenarios: [] });
    expect(notes).toEqual([]);
  });

  it("lists the cycle step of a done feature when it was something other than done", () => {
    const { progress, notes } = convertProgress({
      current_focus: null,
      features: [{ id: "FR-DEMO-01", title: "A", status: "done", cycle_step: "bdd_green", scenarios: [] }],
    });
    expect(progress.features[0]).not.toHaveProperty("cycle_step");
    expect(notes).toEqual(["FR-DEMO-01: cycle_step bdd_green dropped"]);
  });

  it("drops and lists the cycle step of a pending feature", () => {
    const { progress, notes } = convertProgress({
      current_focus: null,
      features: [{ id: "FR-DEMO-01", title: "A", status: "pending", cycle_step: "spec_review", scenarios: [] }],
    });
    expect(progress.features[0]).not.toHaveProperty("cycle_step");
    expect(notes).toEqual(["FR-DEMO-01: cycle_step spec_review dropped"]);
  });

  it("lists nothing for a done feature that has no cycle step", () => {
    const { notes } = convertProgress({
      current_focus: null,
      features: [{ id: "FR-DEMO-01", title: "A", status: "done", scenarios: [] }],
    });
    expect(notes).toEqual([]);
  });

  it("drops the scenarios of a pending feature and lists how many", () => {
    const { progress, notes } = convertProgress({
      current_focus: null,
      features: [
        {
          id: "FR-DEMO-01",
          title: "A",
          status: "pending",
          scenarios: [
            { name: "First", bdd: "pending" },
            { name: "Second", bdd: "pending" },
          ],
        },
      ],
    });
    expect(progress.features[0]).not.toHaveProperty("scenarios");
    expect(notes).toEqual(["FR-DEMO-01: 2 scenarios dropped"]);
  });

  it("converts a pending feature that has no scenarios field without listing anything", () => {
    const { progress, notes } = convertProgress({
      current_focus: null,
      features: [{ id: "FR-DEMO-01", title: "A", status: "pending" }],
    });
    expect(progress.features[0]).toEqual({ id: "FR-DEMO-01", title: "A", status: "pending" });
    expect(notes).toEqual([]);
  });

  it("drops unit_tests from scenarios and lists their number once", () => {
    const { progress, notes } = convertProgress({
      current_focus: null,
      features: [
        {
          id: "FR-DEMO-01",
          title: "A",
          status: "done",
          scenarios: [
            { name: "One", bdd: "pass", unit_tests: 2 },
            { name: "Two", bdd: "pass", unit_tests: 1 },
          ],
        },
        { id: "FR-DEMO-02", title: "B", status: "done", scenarios: [{ name: "Three", bdd: "pass", unit_tests: 4 }] },
      ],
    });
    expect(progress.features[0]!.scenarios).toEqual([
      { name: "One", bdd: "pass" },
      { name: "Two", bdd: "pass" },
    ]);
    expect(progress.features[1]!.scenarios).toEqual([{ name: "Three", bdd: "pass" }]);
    expect(notes).toEqual(["unit_tests dropped from 3 scenarios"]);
  });

  it("drops other scenario fields and lists them with their value", () => {
    const { progress, notes } = convertProgress({
      current_focus: null,
      features: [
        {
          id: "FR-DEMO-01",
          title: "A",
          status: "done",
          scenarios: [{ name: "Three", bdd: "pass", unit_tests: 4, owner: "juan", retries: 2 }],
        },
      ],
    });
    expect(progress.features[0]!.scenarios).toEqual([{ name: "Three", bdd: "pass" }]);
    expect(notes).toEqual([
      "FR-DEMO-01, scenario Three: owner juan dropped",
      "FR-DEMO-01, scenario Three: retries 2 dropped",
      "unit_tests dropped from 1 scenarios",
    ]);
  });

  it("drops fields the article does not define and lists them with their value", () => {
    const { progress, notes } = convertProgress({
      current_focus: null,
      features: [
        { id: "FR-DEMO-01", title: "A", status: "done", note: "see FR-DEMO-02", tags: ["ui"], scenarios: [] },
      ],
    });
    expect(progress.features[0]).toEqual({ id: "FR-DEMO-01", title: "A", status: "done", scenarios: [] });
    expect(notes).toEqual(["FR-DEMO-01: note see FR-DEMO-02 dropped", 'FR-DEMO-01: tags ["ui"] dropped']);
  });

  it("clears a focus that does not point to an in-progress feature after conversion and lists it", () => {
    const { progress, notes } = convertProgress({
      current_focus: "FR-DEMO-01",
      features: [{ id: "FR-DEMO-01", title: "A", status: "blocked" }],
    });
    expect(progress.current_focus).toBeNull();
    expect(notes).toContain("current_focus FR-DEMO-01 reset to null");
  });

  it("refuses a document that has no list of features", () => {
    expect(() => convertProgress({ current_focus: null })).toThrow(ProgressError);
    expect(() => convertProgress({ current_focus: null })).toThrow("progress.json cannot be imported: features must be a list");
  });
});
