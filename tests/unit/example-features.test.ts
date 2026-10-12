import { describe, expect, it } from "vitest";
import { designPassages, exampleFeatures } from "../../src/agents/context/example-features.js";

const RUN_FEATURE = `@FR-RUN-07
Feature: Stop when the run needs a human
  Background:
    Given a git project with a green suite
    And the human is asked a question
  Scenario: The run needs a human
    When I run "oid run" and the run finishes or fails
    Then the event log of the run records a transition to "WAITING_INPUT"
`;
const RUN_FEATURE_TWO = `@FR-RUN-09
Feature: A failed run
  Scenario: The run fails
    When I run "oid run" with a failing agent
    Then the event log of the run records a transition to "FAILED"
`;
const TUI_FEATURE = `@FR-TUI-03
Feature: Plain output without a terminal
  Scenario: A state change is printed as one line
    When oid emits a state change from "BDD_RED" to "TDD_RED"
    Then oid prints exactly one line
`;
const TUI_FEATURE_TWO = `@FR-TUI-05
Feature: Colours of the card
  Scenario: A card is drawn
    When oid draws a decision card
    Then oid prints a box
`;
const OWN = `@FR-TUI-06
Feature: Notifications
  Scenario: A command runs whenever the run needs a human, finishes or fails
    When the run needs a human
    Then the command runs
`;
const sources = [
  { path: "features/tui-03.feature", text: TUI_FEATURE },
  { path: "features/tui-05.feature", text: TUI_FEATURE_TWO },
  { path: "features/tui-06.feature", text: OWN },
  { path: "features/run-07.feature", text: RUN_FEATURE },
  { path: "features/run-09.feature", text: RUN_FEATURE_TWO },
];
const REQUIREMENT = "A configurable command runs whenever the run needs a human, finishes or fails, so unattended runs can notify the user.";

describe("the examples shown to the feature writer", () => {
  it("are the features most relevant to the requirement, whatever their area: a requirement about a run that needs a human ranks the run features above the TUI ones", () => {
    const paths = exampleFeatures(sources, "FR-TUI-06", { requirement: REQUIREMENT, design: [] }).map(({ path }) => path);
    expect(paths.slice(0, 2).sort()).toEqual(["features/run-07.feature", "features/run-09.feature"]);
    expect(paths).toHaveLength(3);
  });

  it("count the terms that the design passages give about the requirement", () => {
    const passage = "Notifications report a decision card box to the user.";
    const paths = exampleFeatures(sources, "FR-TUI-06", { requirement: "Notify the user.", design: [passage] }).map(({ path }) => path);
    expect(paths[0]).toBe("features/tui-05.feature");
  });

  it("never include the file of the requirement itself", () => {
    const paths = exampleFeatures(sources, "FR-TUI-06", { requirement: REQUIREMENT, design: [] }).map(({ path }) => path);
    expect(paths).not.toContain("features/tui-06.feature");
  });

  it("give the same answer for the same input, and break a tie by the same area first and then by path", () => {
    const flat = ["b-02", "a-02", "b-01", "a-01"].map((name) => ({ path: `features/${name}.feature`, text: `@FR-${name.slice(0, 1).toUpperCase()}-0${name.slice(-1)}\nFeature: ${name}\n` }));
    const first = exampleFeatures(flat, "FR-B-09", { requirement: "Nothing in common.", design: [] }).map(({ path }) => path);
    expect(exampleFeatures([...flat].reverse(), "FR-B-09", { requirement: "Nothing in common.", design: [] }).map(({ path }) => path)).toEqual(first);
    expect(first).toEqual(["features/b-01.feature", "features/b-02.feature", "features/a-01.feature"]);
  });
});

describe("the design passages about a requirement", () => {
  it("are the paragraphs of the design notes that share the most distinctive terms with the requirement, the best first, at most the count asked", () => {
    const best = "The run needs a human when a question is open, and the command is configured by notify_command; it also runs when the run finishes or fails.";
    const second = "A notify command runs when the run needs a human, and the cart is shown in blue colours.";
    const notes = [`The cart holds lines and their prices, which are shown in the order of the basket.\n\n${second}\n\n${best}\n\nColours are blue, and so are the cards that the people see on the screen.`];
    expect(designPassages(notes, REQUIREMENT, 2)).toEqual([best, second]);
    expect(designPassages(notes, REQUIREMENT, 1)).toEqual([best]);
  });

  it("leave out the requirement's own paragraph, a heading, a table and a paragraph too long to tell one thing", () => {
    const own = "A configurable command runs whenever the run needs a human, finishes or fails.";
    const table = "| Event | The run needs a human, finishes or fails, with a configurable command |\n|:--|:--|";
    const heading = "### The run needs a human, finishes or fails with a configurable command";
    const long = `The run needs a human, finishes or fails. ${"Filler words that tell other things. ".repeat(60)}`;
    expect(designPassages([[own, table, heading, long].join("\n\n")], `### FR-A-01: Notify\n\n${own}`, 5)).toEqual([]);
  });
});
