import { describe, expect, it } from "vitest";
import { frozenParts, OUTSIDE_SCENARIOS, WHOLE_FILE } from "../../src/artifacts/feature-approval.js";

/** A scenario is approved when one of its effective tags is the tag of a finished FR. */
const approved = (_name: string, tags: string[]): boolean => tags.includes("@FR-DONE");

function feature(...children: string[]): string {
  return ["Feature: Shared", "", ...children].join("\n");
}

function scenario(tag: string, name: string, ...steps: string[]): string {
  return [`  ${tag}`, `  Scenario: ${name}`, ...steps.map((step) => `    ${step}`), ""].join("\n");
}

/** An unterminated docstring: the Gherkin parser rejects it. */
const UNPARSABLE = 'Feature: broken\n  Scenario: x\n    Given a\n      """\n';

const DONE = scenario("@FR-DONE", "Done one", "Given a");
const OPEN = scenario("@FR-OPEN", "Open one", "Given b");

describe("frozenParts", () => {
  it("allows removing a scenario that was not approved from a file shared with a finished FR", () => {
    expect(frozenParts(feature(DONE, OPEN), feature(DONE), approved)).toEqual([]);
  });

  it("names a changed scenario that was approved", () => {
    const changedDone = scenario("@FR-DONE", "Done one", "Given a", "Then c");
    expect(frozenParts(feature(DONE, OPEN), feature(changedDone, OPEN), approved)).toEqual(["Done one"]);
  });

  it("freezes a scenario that is added with the tag of an approved FR", () => {
    const added = scenario("@FR-DONE", "New one", "Given d");
    expect(frozenParts(feature(OPEN), feature(OPEN, added), approved)).toEqual(["New one"]);
  });

  it("allows adding a scenario of an FR that is not approved", () => {
    const added = scenario("@FR-OPEN", "New one", "Given d");
    expect(frozenParts(feature(DONE), feature(DONE, added), approved)).toEqual([]);
  });

  it("freezes the removal of an approved scenario", () => {
    expect(frozenParts(feature(DONE, OPEN), feature(OPEN), approved)).toEqual(["Done one"]);
  });

  it("counts a tag change against the destination FR as well as the origin", () => {
    const moved = scenario("@FR-DONE", "Open one", "Given b");
    expect(frozenParts(feature(DONE, OPEN), feature(DONE, moved), approved)).toEqual(["Open one"]);
  });

  it("counts a tag change against the origin FR", () => {
    const moved = scenario("@FR-OPEN", "Done one", "Given a");
    expect(frozenParts(feature(DONE, OPEN), feature(moved, OPEN), approved)).toEqual(["Done one"]);
  });

  it("freezes what is outside the scenarios when any scenario of the file is approved", () => {
    const withBackground = ["Feature: Shared", "", "  Background:", "    Given z", "", DONE].join("\n");
    const changedBackground = withBackground.replace("Given z", "Given y");
    expect(frozenParts(withBackground, changedBackground, approved)).toEqual([OUTSIDE_SCENARIOS]);
    expect(frozenParts(feature(OPEN), feature(OPEN).replace("Shared", "Renamed"), approved)).toEqual([]);
  });

  it("freezes the outside of a file when the approved scenario is only in the new version", () => {
    expect(frozenParts(feature(OPEN), feature(OPEN, DONE).replace("Shared", "Renamed"), approved)).toEqual(["Done one", OUTSIDE_SCENARIOS]);
  });

  it("inherits the tags of a Rule", () => {
    const rule = (tag: string, step: string) => ["Feature: Shared", "", `  ${tag}`, "  Rule: R", "", "    Scenario: Inside", `      Given ${step}`, ""].join("\n");
    expect(frozenParts(rule("@FR-DONE", "a"), rule("@FR-DONE", "b"), approved)).toEqual(["Inside"]);
    expect(frozenParts(rule("@FR-OPEN", "a"), rule("@FR-OPEN", "b"), approved)).toEqual([]);
  });

  it("judges a file with two scenarios of the same name as a whole", () => {
    const twin = feature(OPEN, OPEN);
    expect(frozenParts(twin, twin.replace("Given b", "Given q"), approved)).toEqual([]);
    expect(frozenParts(feature(DONE, DONE), feature(DONE, DONE, OPEN), approved)).toEqual([WHOLE_FILE]);
  });

  it("judges a file that cannot be parsed as a whole", () => {
    expect(frozenParts(feature(DONE), UNPARSABLE, approved)).toEqual([WHOLE_FILE]);
    expect(frozenParts(feature(OPEN), UNPARSABLE, approved)).toEqual([]);
  });

  it("allows everything in a file with no approved scenario, at the base or now", () => {
    const other = scenario("@FR-OPEN", "Other", "Given e");
    expect(frozenParts(feature(OPEN), feature(other).replace("Shared", "Renamed"), approved)).toEqual([]);
    expect(frozenParts(undefined, feature(OPEN), approved)).toEqual([]);
    expect(frozenParts(feature(OPEN), undefined, approved)).toEqual([]);
  });

  it("treats a new file with an approved scenario and a deleted approved file as changes to those scenarios", () => {
    expect(frozenParts(undefined, feature(DONE), approved)).toEqual(["Done one", OUTSIDE_SCENARIOS]);
    expect(frozenParts(feature(DONE), undefined, approved)).toEqual(["Done one", OUTSIDE_SCENARIOS]);
  });
});
