import { describe, expect, it } from "vitest";
import { testTaskContext } from "../../src/agents/context/task-context.js";
import { dir, useTempDir, write, writeMinimalConfig } from "./temp-project.js";

useTempDir();

const STEPS = [
  'import assert from "node:assert/strict";',
  "",
  'When("the customer pays by card", function () {',
  '  this.paid = "BODY-WHEN";',
  "});",
  "",
  "Then(/finish|paid|done/i, function () {",
  "  assert.match(this.notice, /finish|complete|done/i);",
  "  // BODY-THEN-PAID",
  "});",
  "",
  'Then("the voucher is spent", function () {',
  '  this.spent = "BODY-VOUCHER";',
  "});",
  "",
].join("\n");

function project(): void {
  writeMinimalConfig({ paths: { source: ["src/**"], shared: [], unit_tests: [], bdd_features: ["features/**/*.feature"], bdd_steps: ["features/steps/**/*.ts"], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" } });
  write("features/checkout.feature", "Feature: Checkout\n  Scenario: Pay by card\n    When the customer pays by card\n    Then the order is paid\n");
  write("features/steps/checkout.steps.ts", STEPS);
}

const SCENARIO = { file: "features/checkout.feature", line: 2 };

describe("the step definition a test task shows", () => {
  it("is the whole definition that holds the line the failure names, with its file, and no other definition", () => {
    project();
    const failure = `AssertionError: the notice does not describe a finished feature\n    at World.<anonymous> (${dir}/features/steps/checkout.steps.ts:8:10)`;
    const task = testTaskContext(dir, { scenario: SCENARIO, failure });
    expect(task).toContain("Step definition that fails:\n\n### features/steps/checkout.steps.ts\nThen(/finish|paid|done/i, function () {\n  assert.match(this.notice, /finish|complete|done/i);\n  // BODY-THEN-PAID\n});");
    for (const left of ["BODY-WHEN", "BODY-VOUCHER"]) expect(task).not.toContain(left);
  });

  it("is, when the failure names no line of a step definition, the whole definition of each Then step of the scenario, with its file", () => {
    project();
    const outside = `AssertionError: expected the order to be paid\n    at World.<anonymous> (${dir}/src/cart.ts:3:10)`;
    for (const failure of ["expected the order to be paid", outside]) {
      const task = testTaskContext(dir, { scenario: SCENARIO, failure });
      expect(task).toContain("Step definitions of the Then steps of the scenario:\n\n### features/steps/checkout.steps.ts\nThen(/finish|paid|done/i, function () {\n  assert.match(this.notice, /finish|complete|done/i);\n  // BODY-THEN-PAID\n});");
      for (const left of ["BODY-WHEN", "BODY-VOUCHER", "Step definition that fails"]) expect(task).not.toContain(left);
    }
  });

  it("is cut at 60 lines, with a note that counts the others and names the file, so that a long definition does not fill the task", () => {
    project();
    const body = Array.from({ length: 100 }, (_, index) => `  this.line${index + 1} = ${index + 1};`);
    write("features/steps/checkout.steps.ts", ["Then(/finish|paid|done/i, function () {", ...body, "});", ""].join("\n"));
    const failure = `AssertionError: no\n    at World.<anonymous> (${dir}/features/steps/checkout.steps.ts:5:10)`;
    for (const task of [testTaskContext(dir, { scenario: SCENARIO, failure }), testTaskContext(dir, { scenario: SCENARIO, failure: "no" })]) {
      expect(task).toContain("  this.line59 = 59;\n(42 more lines; read features/steps/checkout.steps.ts for the rest)");
      expect(task).not.toContain("this.line60 =");
    }
  });
});
