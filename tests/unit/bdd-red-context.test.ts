import { describe, expect, it } from "vitest";
import { bddRedContext } from "../../src/agents/context/task-context.js";
import { dir, useTempDir, write, writeMinimalConfig } from "./temp-project.js";

useTempDir();

describe("the context of a BDD Red task", () => {
  it("gives the scenario with its location, the paths of the step files, the pattern of each step definition that exists and the public signatures, and no other scenario, test or body", () => {
    writeMinimalConfig({ paths: { source: ["src/**"], shared: [], unit_tests: ["tests/unit/**"], bdd_features: ["features/**/*.feature"], bdd_steps: ["features/steps/**/*.ts"], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" } });
    write("features/checkout.feature", "Feature: Checkout\n  Scenario: Pay by card\n    When the customer pays by card\n\n  Scenario: Pay by voucher\n    When the customer pays by voucher\n");
    write("features/steps/shared.steps.ts", 'Given("a customer", function () {}); // STEP-BODY\n');
    write("tests/unit/a.test.ts", "// UNIT-TEST\n");
    write("src/a.ts", "/** Makes a. */\nexport function a(): number {\n  return 1; // BODY-A\n}\n");
    const task = bddRedContext(dir, { file: "features/checkout.feature", line: 2 });
    for (const included of ["features/checkout.feature:2", "Pay by card", "- features/steps/shared.steps.ts", 'Given("a customer")', "a(): number", "Makes a."]) expect(task).toContain(included);
    for (const left of ["voucher", "UNIT-TEST", "BODY-A", "STEP-BODY"]) expect(task).not.toContain(left);
  });

  it("recognises the step definitions the scenario uses whatever their pattern: a cucumber expression with parameters and optional text, or a regular expression", () => {
    writeMinimalConfig({ paths: { source: ["src/**"], shared: [], unit_tests: [], bdd_features: ["features/**/*.feature"], bdd_steps: ["features/steps/**/*.ts"], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" } });
    write("features/checkout.feature", 'Feature: Checkout\n  Scenario: Pay\n    Given a cart with 3 items\n    When the customer pays "card" and waits 2 seconds\n    Then the order is paid in 5 days\n    And the log says the 4 items were counted\n');
    write(
      "features/steps/shared.steps.ts",
      [
        'Given("a cart with {int} items", function () {\n  /* BODY-INT */\n});',
        'When("the customer pays {string} and waits {int} second(s)", function () {\n  /* BODY-STRING */\n});',
        "Then(/^the order is paid in (\\d+) days$/, function () {\n  /* BODY-REGEXP */\n});",
        'Then("the log says the {int} items were counted", function () {\n  /* BODY-LAST */\n});',
        'Then("an order is refused", function () {\n  /* BODY-NOT-USED */\n});',
      ].join("\n\n") + "\n",
    );
    const task = bddRedContext(dir, { file: "features/checkout.feature", line: 2 });
    for (const used of ["BODY-INT", "BODY-STRING", "BODY-REGEXP", "BODY-LAST"]) expect(task).toContain(used);
    expect(task).not.toContain("BODY-NOT-USED");
  });

  it("counts the steps of the Background of the feature file among those the scenario uses, and not those inside a doc string", () => {
    writeMinimalConfig({ paths: { source: ["src/**"], shared: [], unit_tests: [], bdd_features: ["features/**/*.feature"], bdd_steps: ["features/steps/**/*.ts"], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" } });
    write("features/checkout.feature", 'Feature: Checkout\n  Background:\n    Given a shop\n    And a file holding:\n      """\n      Given a doc string line\n      """\n\n  Scenario: Pay\n    When the customer pays\n\n  Scenario: Other\n    Given an unrelated step\n');
    write("features/steps/shared.steps.ts", ['Given("a shop", function () {\n  /* BODY-SHOP */\n});', 'Given("a doc string line", function () {\n  /* BODY-DOC */\n});', 'Given("an unrelated step", function () {\n  /* BODY-OTHER */\n});', 'Given("a file holding:", function () {\n  /* BODY-FILE */\n});'].join("\n\n") + "\n");
    const task = bddRedContext(dir, { file: "features/checkout.feature", line: 9 });
    for (const used of ["BODY-SHOP", "BODY-FILE"]) expect(task).toContain(used);
    for (const left of ["BODY-DOC", "BODY-OTHER"]) expect(task).not.toContain(left);
  });

  it("gives the whole definition of each step the scenario already uses, with its file, and the others only by their pattern", () => {
    writeMinimalConfig({ paths: { source: ["src/**"], shared: [], unit_tests: [], bdd_features: ["features/**/*.feature"], bdd_steps: ["features/steps/**/*.ts"], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" } });
    write("features/checkout.feature", "Feature: Checkout\n  Scenario: Pay by card\n    Given a customer\n    When the customer pays by card\n");
    write("features/steps/shared.steps.ts", 'Given("a customer", function () {\n  world.customer = "MATCHED-BODY";\n});\n\nGiven("a voucher", function () {\n  world.voucher = "OTHER-BODY";\n});\n');
    const task = bddRedContext(dir, { file: "features/checkout.feature", line: 2 });
    expect(task).toContain('Step definitions the scenario already uses:\n\n### features/steps/shared.steps.ts\nGiven("a customer", function () {\n  world.customer = "MATCHED-BODY";\n});');
    expect(task).toContain('Given("a voucher")');
    expect(task).not.toContain("OTHER-BODY");
  });
});
