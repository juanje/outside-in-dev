import { describe, expect, it } from "vitest";
import { unrunSteps } from "../../src/artifacts/cucumber-report.js";

const URI = "features/a.feature";

/** A report of one scenario whose steps have these keywords, texts and statuses, written as Cucumber writes it: the keyword is in the Gherkin document, the text in the pickle. */
function report(steps: { keyword: string; text: string; status: string }[], name = "Shout"): string {
  const gherkinSteps = steps.map(({ keyword, text }, at) => ({ id: `g${at}`, keyword, text, location: { line: 4 + at, column: 5 } }));
  const document = { gherkinDocument: { uri: URI, feature: { name: "Greeting", children: [{ scenario: { id: "sc", name, steps: gherkinSteps } }] } } };
  const pickle = { pickle: { id: "p", uri: URI, name, steps: steps.map(({ text }, at) => ({ id: `ps${at}`, text, astNodeIds: [`g${at}`] })) } };
  const testCase = { testCase: { id: "c", pickleId: "p", testSteps: steps.map((_, at) => ({ id: `t${at}`, pickleStepId: `ps${at}` })) } };
  const started = { testCaseStarted: { id: "r", testCaseId: "c" } };
  const finished = steps.map(({ status }, at) => ({ testStepFinished: { testCaseStartedId: "r", testStepId: `t${at}`, testStepResult: { status } } }));
  return [document, pickle, testCase, started, ...finished].map((line) => JSON.stringify(line)).join("\n");
}

describe("unrunSteps", () => {
  it("names each step that has no definition with its keyword, its text and its line, and leaves the steps that ran out", () => {
    const steps = [
      { keyword: "Given ", text: "the greeting", status: "PASSED" },
      { keyword: "When ", text: "it is shouted at Ann", status: "UNDEFINED" },
      { keyword: "Then ", text: "it shouts Ann", status: "UNDEFINED" },
      { keyword: "And ", text: "it ends with a bang", status: "SKIPPED" },
    ];
    expect(unrunSteps(report(steps))).toEqual([`${URI}:5 When it is shouted at Ann (UNDEFINED)`, `${URI}:6 Then it shouts Ann (UNDEFINED)`]);
  });
});
