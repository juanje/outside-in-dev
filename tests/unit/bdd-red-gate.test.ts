import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bddRedGate } from "../../src/orchestrator/bdd-red-gate.js";
import { committedRepo } from "./git-fixture.js";
import { useTempDir, write } from "./temp-project.js";

useTempDir();

const PATHS = { source: ["src/**"], shared: [], unit_tests: ["tests/unit/**"], bdd_features: ["features/**/*.feature"], bdd_steps: ["features/steps/**/*.ts"], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" };
const COMMANDS = { bdd: "node bdd.cjs", unit: "u", typecheck: "t", format: null, lint: null, coverage: null, extra_checks: [] };

/** A BDD runner that writes the report of one scenario whose step fails with `message`. */
const failingRunner = (message: string) => `
const out = process.argv[process.argv.indexOf("--format") + 1].slice(8);
const message = ${JSON.stringify(message)}.replaceAll("<cwd>", process.cwd());
const lines = [
  { pickle: { id: "p", uri: "features/pay.feature", name: "Pay", steps: [{ id: "ps", text: "I pay" }] } },
  { testCase: { id: "c", pickleId: "p", testSteps: [{ id: "s", pickleStepId: "ps" }] } },
  { testCaseStarted: { id: "r", testCaseId: "c" } },
  { testStepFinished: { testCaseStartedId: "r", testStepId: "s", testStepResult: { status: "FAILED", message } } },
];
require("node:fs").writeFileSync(out, lines.map((line) => JSON.stringify(line)).join("\\n") + "\\n");
`;

/** A BDD runner that writes the report of the given scenarios, each with the status of its only step. */
const scenariosRunner = (scenarios: { uri: string; name: string; status: string; message?: string }[]) => `
const out = process.argv[process.argv.indexOf("--format") + 1].slice(8);
const lines = ${JSON.stringify(scenarios)}.flatMap(({ uri, name, status, message }, at) => [
  { pickle: { id: "p" + at, uri, name, steps: [{ id: "ps" + at, text: "a step" }] } },
  { testCase: { id: "c" + at, pickleId: "p" + at, testSteps: [{ id: "s" + at, pickleStepId: "ps" + at }] } },
  { testCaseStarted: { id: "r" + at, testCaseId: "c" + at } },
  { testStepFinished: { testCaseStartedId: "r" + at, testStepId: "s" + at, testStepResult: { status, message: message?.replaceAll("<cwd>", process.cwd()) } } },
]);
require("node:fs").writeFileSync(out, lines.map((line) => JSON.stringify(line)).join("\\n") + "\\n");
`;

function project(runner: string, passing: { id: string; scenario: string; file: string }[] = []): string {
  return committedRepo("project", {
    ".outside-in.json": JSON.stringify({ version: 1, stack: "typescript", paths: PATHS, commands: COMMANDS }),
    ".gitignore": ".outside-in/\n",
    "progress.json": JSON.stringify({
      current_focus: null,
      features: [{ id: "FR-A-01", title: "One", status: "in_progress", cycle_step: "bdd_red", scenarios: [] }, ...passing.map(({ id, scenario }) => ({ id, title: id, status: "done", scenarios: [{ name: scenario, bdd: "pass" }] }))],
    }),
    ...Object.fromEntries(passing.map(({ id, scenario, file }) => [file, `@${id}\nFeature: Old\n  Scenario: ${scenario}\n    When it works\n`])),
    "features/pay.feature": "@FR-A-01\nFeature: Pay\n  Scenario: Pay\n    When I pay\n",
    "bdd.cjs": runner,
  });
}

describe("the gate of BDD Red", () => {
  it("accepts a scenario whose step fails because a source module does not exist yet", () => {
    const repo = project(failingRunner("Error: Cannot find module '<cwd>/src/cart.js' imported from <cwd>/features/steps/pay.steps.ts"));
    expect(bddRedGate(repo, { file: "features/pay.feature", line: 3, name: "Pay" }, {})).toEqual({ kind: "valid", reason: "the module src/cart.js does not exist yet", message: expect.stringContaining("Cannot find module") });
  });

  it("hands a failure that needs a decision to a person with the step that failed", () => {
    const repo = project(failingRunner("Error: the cart could not be built"));
    expect(bddRedGate(repo, { file: "features/pay.feature", line: 3, name: "Pay" }, {})).toEqual({
      kind: "decision",
      reason: "the test failed with an error that is not an assertion",
      message: "Error: the cart could not be built",
      detail: "failing step: features/pay.feature I pay",
      step: "features/pay.feature I pay",
    });
  });

  it("stops before running anything when the agent changed source code or an approved feature file, or wrote a step file that cannot load", () => {
    const repo = project("process.exit(9);");
    const approved = `sha256:${createHash("sha256").update("@FR-A-01\nFeature: Pay\n  Scenario: Pay\n    When I pay\n").digest("hex")}`;
    write("project/src/cart.ts", "export const cart = 1;\n");
    write("project/features/pay.feature", "@FR-A-01\nFeature: Pay\n  Scenario: Pay\n    When I pay again\n");
    write("project/features/steps/pay.steps.ts", 'import { later } from "../../src/later.js";\nlater();\n');
    const gate = bddRedGate(repo, { file: "features/pay.feature", line: 3, name: "Pay" }, { "features/pay.feature": approved });
    expect(gate.kind).toBe("problem");
    for (const fragment of ["src/cart.ts changed source code while writing tests", "features/pay.feature changed an approved feature file", 'features/steps/pay.steps.ts:1 imports later from "../../src/later.js"']) expect(gate).toMatchObject({ problem: expect.stringContaining(fragment) });
  });

  it("is a problem that names a scenario that passed and no longer passes, even when the current one fails validly", () => {
    const missing = "Error: Cannot find module '<cwd>/src/cart.js' imported from <cwd>/features/steps/pay.steps.ts";
    const runner = scenariosRunner([
      { uri: "features/pay.feature", name: "Pay", status: "FAILED", message: missing },
      { uri: "features/old.feature", name: "Old", status: "FAILED", message: "Error: broken" },
    ]);
    const repo = project(runner, [{ id: "FR-B-01", scenario: "Old", file: "features/old.feature" }]);
    const gate = bddRedGate(repo, { file: "features/pay.feature", line: 3, name: "Pay" }, {});
    expect(gate).toMatchObject({ kind: "problem", problem: expect.stringContaining("features/old.feature:3 Old") });
  });
});
