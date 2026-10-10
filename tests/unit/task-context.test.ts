import { describe, expect, it } from "vitest";
import { implementationContext, testTaskContext } from "../../src/agents/context/task-context.js";
import { dir, useTempDir, write, writeMinimalConfig } from "./temp-project.js";

useTempDir();

const FEATURE = ["Feature: Checkout", "  Scenario: Pay by card", "    When the customer pays by card", "    Then the order is paid", "", "  Scenario: Pay by voucher", "    When the customer pays by voucher", ""].join("\n");

describe("task context", () => {
  it("gives a test task the scenario with its location and the failure, and no source or other scenario", () => {
    writeMinimalConfig();
    write("features/checkout.feature", FEATURE);
    write("src/a.ts", "export const a = 1; // BODY-A\n");
    const task = testTaskContext(dir, { scenario: { file: "features/checkout.feature", line: 2 }, failure: "expected paid" });
    expect(task).toContain("features/checkout.feature:2");
    expect(task).toContain("Scenario: Pay by card\n    When the customer pays by card\n    Then the order is paid");
    expect(task).toContain("expected paid");
    expect(task).not.toContain("voucher");
    expect(task).not.toContain("BODY-A");
  });

  it("presents the failure to a test task as its starting point", () => {
    writeMinimalConfig();
    write("features/checkout.feature", FEATURE);
    const task = testTaskContext(dir, { scenario: { file: "features/checkout.feature", line: 2 }, failure: "expected paid" });
    expect(task).toContain("Current failure of the scenario (your starting point):\n\nexpected paid");
  });

  it("gives a test task the public signatures of the project's exported symbols, with the first documentation line and no body", () => {
    writeMinimalConfig();
    write("features/checkout.feature", FEATURE);
    write("src/unrelated.ts", "/** Does something else.\n * Second line. */\nexport function other(id: string): void {\n  // BODY-OTHER\n}\n");
    const task = testTaskContext(dir, { scenario: { file: "features/checkout.feature", line: 2 }, failure: "expected paid" });
    for (const included of ["Reuse catalogue", "## src/unrelated.ts", "other(id: string): void", "Does something else."]) expect(task).toContain(included);
    for (const left of ["BODY-OTHER", "Second line.", "voucher"]) expect(task).not.toContain(left);
  });

  it("presents the failure to an implementation task as its starting point", () => {
    writeMinimalConfig();
    write("tests/unit/a.test.ts", "// TEST-BODY\n");
    const task = implementationContext(dir, { tests: ["tests/unit/a.test.ts"], failure: "a is not a function" });
    expect(task).toContain("Current failure of the test (your starting point):\n\na is not a function");
  });

  it("gives an implementation task the failing test, the failure, the code it imports and the catalogue, and no other source body or scenario", () => {
    writeMinimalConfig();
    write("features/checkout.feature", FEATURE);
    write("tests/unit/a.test.ts", 'import { a } from "../../src/a.js";\n// TEST-BODY\n');
    write("src/a.ts", 'import { b } from "./b.js";\n/** Makes a. */\nexport function a(): number {\n  return b; // BODY-A\n}\n');
    write("src/b.ts", "export const b = 1; // BODY-B\n");
    write("src/unrelated.ts", "/** Does something else. */\nexport function other(): void {\n  // BODY-OTHER\n}\n");
    const task = implementationContext(dir, { tests: ["tests/unit/a.test.ts"], failure: "a is not a function" });
    for (const included of ["TEST-BODY", "tests/unit/a.test.ts", "a is not a function", "BODY-A", "BODY-B", "Reuse catalogue", "## src/unrelated.ts", "other(): void"]) expect(task).toContain(included);
    for (const left of ["BODY-OTHER", "voucher"]) expect(task).not.toContain(left);
  });
});
