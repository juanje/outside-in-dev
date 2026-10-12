import { describe, expect, it } from "vitest";
import { stepCatalogue } from "../../src/agents/context/step-catalogue.js";

const files = [
  { file: "features/steps/a.steps.ts", source: 'Given("a cart with {int} lines", () => { /* BODY-A */ });\nWhen("the human answers {string}", () => {});\n' },
  { file: "features/steps/b.steps.ts", source: 'Given("a git project with a green suite", () => {});\nThen("the process exits with code {int}", () => {});\nThen("the event log records a notification", () => {});\n' },
  { file: "features/steps/c.steps.ts", source: 'Given("a basket", () => {});\n' },
];
const none = { examples: [], requirement: "", budget: 10_000 };

describe("the catalogue of existing steps for the feature writer", () => {
  it("groups the patterns by step file, without code", () => {
    const text = stepCatalogue(files, none);
    expect(text).toContain('### features/steps/b.steps.ts\n- Given("a git project with a green suite")');
    expect(text).not.toContain("BODY-A");
  });

  it("puts first the steps that the example features use, then those that share terms with the requirement, then the rest by file", () => {
    const examples = [{ path: "features/x.feature", text: "Feature: X\n  Scenario: S\n    Given a git project with a green suite\n" }];
    const text = stepCatalogue(files, { examples, requirement: "A notification is recorded in the event log.", budget: 10_000 });
    const order = ['"a git project with a green suite"', '"the event log records a notification"', '"a cart with {int} lines"', '"a basket"'].map((pattern) => text.indexOf(pattern));
    expect(order.every((position) => position >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("stops at the budget and ends with the line that lists the step files left out", () => {
    const text = stepCatalogue(files, { examples: [], requirement: "A basket.", budget: 60 });
    expect(text).toContain('"a basket"');
    expect(text).not.toContain("a cart with");
    expect(text.split("\n").at(-1)).toBe("Step files not shown (read one when you need its steps): features/steps/a.steps.ts, features/steps/b.steps.ts");
  });

  it("has no line about files left out when everything fits", () => {
    expect(stepCatalogue(files, none)).not.toContain("not shown");
  });
});
