import { describe, expect, it } from "vitest";
import { validateSpec } from "../../src/artifacts/spec.js";

describe("validateSpec", () => {
  it("reports a requirement ID that is defined twice", () => {
    const text = ["### FR-X-01: Alpha", "", "Does alpha.", "", "### FR-X-01: Alpha again", "", "Does it twice."].join("\n");
    expect(validateSpec(text)).toEqual([{ id: "FR-X-01", kind: "duplicate ID" }]);
  });

  it("reports a requirement heading with nothing after the colon as an empty title", () => {
    const text = ["### FR-X-01:", "", "Does alpha."].join("\n");
    expect(validateSpec(text)).toEqual([{ id: "FR-X-01", kind: "empty title" }]);
  });

  it("reports a requirement whose body is empty up to the next heading", () => {
    const text = ["### FR-X-01: Alpha", "", "", "### FR-X-02: Beta", "", "Does beta."].join("\n");
    expect(validateSpec(text)).toEqual([{ id: "FR-X-01", kind: "empty body" }]);
  });

  it("reports a Given line followed later by a Then line as acceptance criteria", () => {
    const text = ["### FR-X-01: Alpha", "", "Given a project on disk", "When the user runs it", "Then it prints a report"].join("\n");
    expect(validateSpec(text)).toEqual([{ id: "FR-X-01", kind: "acceptance criteria" }]);
  });

  it("recognises bulleted and bold Given and Then lines", () => {
    const text = ["### FR-X-01: Alpha", "", "- **Given** a project on disk", "* Then it prints a report"].join("\n");
    expect(validateSpec(text)).toEqual([{ id: "FR-X-01", kind: "acceptance criteria" }]);
  });

  it("reports a Scenario line as acceptance criteria", () => {
    const text = ["### FR-X-01: Alpha", "", "Scenario: The tool prints a report"].join("\n");
    expect(validateSpec(text)).toEqual([{ id: "FR-X-01", kind: "acceptance criteria" }]);
  });
});
