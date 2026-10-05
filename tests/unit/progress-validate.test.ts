import { describe, expect, it } from "vitest";
import { validateProgress } from "../../src/artifacts/progress.js";

describe("validateProgress", () => {
  it("accepts a valid progress document", () => {
    const valid = {
      current_focus: "FR-X-01",
      features: [
        { id: "FR-X-01", title: "Alpha", status: "in_progress", cycle_step: "select", scenarios: [] },
        { id: "FR-X-02", title: "Beta", status: "pending" },
        { id: "FR-X-03", title: "Gamma", status: "done", scenarios: [{ name: "Works", bdd: "pass" }] },
      ],
    };
    expect(validateProgress(valid)).toEqual([]);
  });

  it("reports an unknown field on a feature with its path", () => {
    const document = {
      current_focus: null,
      features: [
        { id: "FR-X-01", title: "Alpha", status: "pending" },
        { id: "FR-X-02", title: "Beta", status: "pending", notes: "x" },
      ],
    };
    expect(validateProgress(document)).toEqual(["features[1].notes: unknown field"]);
  });

  it("reports an unknown field at the top level", () => {
    expect(validateProgress({ current_focus: null, features: [], comment: "x" })).toEqual(["comment: unknown field"]);
  });

  it("reports a status outside the allowed values", () => {
    const document = { current_focus: null, features: [{ id: "FR-X-01", title: "Alpha", status: "blocked" }] };
    expect(validateProgress(document)).toEqual(['features[0].status: invalid value "blocked" (allowed: pending, in_progress, done)']);
  });

  it("reports a missing required field", () => {
    const document = { current_focus: null, features: [{ id: "FR-X-01", status: "pending" }] };
    expect(validateProgress(document)).toEqual(["features[0].title: missing required field"]);
  });

  it("reports a value of the wrong type", () => {
    expect(validateProgress({ current_focus: 7, features: [] })).toEqual(["current_focus: wrong type (expected string or null)"]);
  });

  it("reports an empty title", () => {
    const document = { current_focus: null, features: [{ id: "FR-X-01", title: "", status: "pending" }] };
    expect(validateProgress(document)).toEqual(["features[0].title: must not be empty"]);
  });

  it("reports a cycle step on a pending feature", () => {
    const document = {
      current_focus: null,
      features: [{ id: "FR-X-01", title: "Alpha", status: "pending", cycle_step: "select" }],
    };
    expect(validateProgress(document)).toEqual(["features[0].cycle_step: not allowed on a pending feature"]);
  });

  it("reports an in-progress feature without a cycle step", () => {
    const document = { current_focus: null, features: [{ id: "FR-X-01", title: "Alpha", status: "in_progress" }] };
    expect(validateProgress(document)).toEqual(["features[0].cycle_step: missing required field on an in-progress feature"]);
  });

  it("reports a cycle step on a done feature", () => {
    const document = {
      current_focus: null,
      features: [{ id: "FR-X-01", title: "Alpha", status: "done", cycle_step: "quality_gate" }],
    };
    expect(validateProgress(document)).toEqual(["features[0].cycle_step: not allowed on a done feature"]);
  });

  it("reports an invalid status on a scenario with its path", () => {
    const document = {
      current_focus: null,
      features: [
        {
          id: "FR-X-01",
          title: "Alpha",
          status: "in_progress",
          cycle_step: "bdd_red",
          scenarios: [{ name: "Works", bdd: "pass" }, { name: "Breaks", bdd: "green" }],
        },
      ],
    };
    expect(validateProgress(document)).toEqual([
      'features[0].scenarios[1].bdd: invalid value "green" (allowed: pass, fail, pending)',
    ]);
  });

  it("reports a features list that is not an array", () => {
    expect(validateProgress({ current_focus: null, features: "none" })).toEqual(["features: wrong type (expected array)"]);
  });

  it("reports an id that is not a requirement id", () => {
    const document = { current_focus: null, features: [{ id: "login", title: "Alpha", status: "pending" }] };
    expect(validateProgress(document)).toEqual(['features[0].id: invalid value "login" (expected an id like FR-AREA-01)']);
  });

  it("reports a cycle step outside the allowed values", () => {
    const document = {
      current_focus: null,
      features: [{ id: "FR-X-01", title: "Alpha", status: "in_progress", cycle_step: "coding" }],
    };
    expect(validateProgress(document)).toEqual([
      'features[0].cycle_step: invalid value "coding" (allowed: select, bdd_red, tdd_red, tdd_green, refactor, quality_gate)',
    ]);
  });

  it("reports a title of the wrong type", () => {
    const document = { current_focus: null, features: [{ id: "FR-X-01", title: 5, status: "pending" }] };
    expect(validateProgress(document)).toEqual(["features[0].title: wrong type (expected string)"]);
  });

  it("reports a scenario with an empty name", () => {
    const document = {
      current_focus: null,
      features: [
        { id: "FR-X-01", title: "Alpha", status: "in_progress", cycle_step: "select", scenarios: [{ name: "", bdd: "fail" }] },
      ],
    };
    expect(validateProgress(document)).toEqual(["features[0].scenarios[0].name: must not be empty"]);
  });
});
