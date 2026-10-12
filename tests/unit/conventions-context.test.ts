import { describe, expect, it } from "vitest";
import { bddRedContext, featureWriteContext, implementationContext, testTaskContext } from "../../src/agents/context/task-context.js";
import { qualityFixContext } from "../../src/orchestrator/quality-fix-context.js";
import { refactorContext } from "../../src/orchestrator/refactor-findings.js";
import { dir, useTempDir, write, writeMinimalConfig } from "./temp-project.js";

useTempDir();

const HEADING = "Project conventions";
const FEATURE = ["Feature: Checkout", "  Scenario: Pay by card", "    When the customer pays by card", "    Then the order is paid", ""].join("\n");

/** The project the six contexts are built from: a feature, a test, a source file and a spec, with `conventions` as the configured paths (none when undefined). */
function project(conventions?: string[]): void {
  writeMinimalConfig({ paths: { source: ["src/**"], shared: [], unit_tests: ["tests/unit/**"], bdd_features: ["features/**/*.feature"], bdd_steps: ["features/steps/**"], docs: [], spec: "SPEC.md", design: [], progress: "progress.json", ...(conventions === undefined ? {} : { conventions }) } });
  write("features/checkout.feature", FEATURE);
  write("SPEC.md", "### FR-A-01: Pay\n\nThe customer pays.\n");
  write("src/a.ts", "export const a = 1;\n");
  write("tests/unit/a.test.ts", "// test\n");
}

const CONTEXTS: [string, () => string][] = [
  ["FEATURE_WRITE", () => featureWriteContext(dir, { fr: "FR-A-01" })],
  ["BDD_RED", () => bddRedContext(dir, { file: "features/checkout.feature", line: 2 })],
  ["TDD_RED", () => testTaskContext(dir, { scenario: { file: "features/checkout.feature", line: 2 }, failure: "expected paid" })],
  ["CODE_GREEN", () => implementationContext(dir, { tests: ["tests/unit/a.test.ts"], failure: "a is not a function" })],
  ["REFACTOR", () => refactorContext(dir, [{ id: "magic-0001", category: "magic_value", file: "src/a.ts", range: { start: 1, end: 1 }, detail: "the number 1" }])],
  ["QUALITY_FIX", () => qualityFixContext(dir, [{ kind: "lint", file: "src/a.ts", line: 1, code: "no-const", message: "Unexpected const." }])],
];

describe("the project conventions in the context of a task", () => {
  it.each(CONTEXTS)("%s gets the text of the configured files, in order, under a heading that makes them the project's own rules", (_state, build) => {
    project(["docs/FIRST.md", "docs/SECOND.md"]);
    write("docs/FIRST.md", "FIRST-RULE\n");
    write("docs/SECOND.md", "SECOND-RULE\n");
    const context = build();
    expect(context).toContain(HEADING);
    expect(context).toMatch(/precedence|come before/);
    expect(context.indexOf("FIRST-RULE")).toBeGreaterThan(context.indexOf(HEADING));
    expect(context.indexOf("SECOND-RULE")).toBeGreaterThan(context.indexOf("FIRST-RULE"));
  });

  it.each(CONTEXTS)("%s has no such section when nothing is configured", (_state, build) => {
    project();
    write("docs/FIRST.md", "FIRST-RULE\n");
    const context = build();
    expect(context).not.toContain(HEADING);
    expect(context).not.toContain("FIRST-RULE");
  });

  it("cuts the text at a budget of its own and names the file, for the agent to read", () => {
    project(["docs/BIG.md", "docs/LATER.md"]);
    write("docs/BIG.md", `${"a convention line\n".repeat(1500)}`);
    write("docs/LATER.md", "LATER-RULE\n");
    const context = featureWriteContext(dir, { fr: "FR-A-01" });
    const section = context.slice(context.indexOf(HEADING));
    expect(section).toContain("a convention line");
    expect(section).not.toContain("LATER-RULE");
    expect(section).toContain("docs/BIG.md");
    expect(section).toContain("docs/LATER.md");
    expect(section.length).toBeLessThan(11000);
  });

  it("skips a missing file and names it in a short note", () => {
    project(["docs/GONE.md", "docs/HERE.md"]);
    write("docs/HERE.md", "HERE-RULE\n");
    const context = implementationContext(dir, { tests: ["tests/unit/a.test.ts"], failure: "a is not a function" });
    expect(context).toContain("HERE-RULE");
    expect(context).toMatch(/not found[^\n]*docs\/GONE\.md|docs\/GONE\.md[^\n]*not found/);
  });

  it("never includes a secret file, and does not print its name as a convention", () => {
    project([".env", "docs/HERE.md"]);
    write(".env", "TOKEN=SECRET-VALUE\n");
    write("docs/HERE.md", "HERE-RULE\n");
    const context = featureWriteContext(dir, { fr: "FR-A-01" });
    expect(context).toContain("HERE-RULE");
    expect(context).not.toContain("SECRET-VALUE");
  });
});
