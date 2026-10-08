import { describe, expect, it } from "vitest";
import { bddRedContext } from "../../src/agents/context/task-context.js";
import { dir, useTempDir, write, writeMinimalConfig } from "./temp-project.js";

useTempDir();

describe("the context of a BDD Red task", () => {
  it("gives the scenario with its location, the step definitions that exist and the public signatures, and no other scenario, test or body", () => {
    writeMinimalConfig({ paths: { source: ["src/**"], shared: [], unit_tests: ["tests/unit/**"], bdd_features: ["features/**/*.feature"], bdd_steps: ["features/steps/**/*.ts"], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" } });
    write("features/checkout.feature", "Feature: Checkout\n  Scenario: Pay by card\n    When the customer pays by card\n\n  Scenario: Pay by voucher\n    When the customer pays by voucher\n");
    write("features/steps/shared.steps.ts", 'Given("a customer", function () {}); // STEP-BODY\n');
    write("tests/unit/a.test.ts", "// UNIT-TEST\n");
    write("src/a.ts", "/** Makes a. */\nexport function a(): number {\n  return 1; // BODY-A\n}\n");
    const task = bddRedContext(dir, { file: "features/checkout.feature", line: 2 });
    for (const included of ["features/checkout.feature:2", "Pay by card", "features/steps/shared.steps.ts", "STEP-BODY", "a(): number", "Makes a."]) expect(task).toContain(included);
    for (const left of ["voucher", "UNIT-TEST", "BODY-A"]) expect(task).not.toContain(left);
  });
});
