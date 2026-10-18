import { describe, expect, it } from "vitest";
import { REAL_RUNNERS, type Runners } from "../../src/artifacts/verify-runner.js";
import { codeGreenGate } from "../../src/orchestrator/code-green-gate.js";
import { committedRepo } from "./git-fixture.js";
import { RUNNER_COMMANDS } from "./green-runners.js";
import { GATE_PATHS } from "./gate-paths.js";
import { useTempDir } from "./temp-project.js";

useTempDir();

const FAILING = { name: "<cwd>/tests/unit/cart.test.ts", message: "", assertionResults: [{ fullName: "cart adds", title: "adds", status: "failed", failureMessages: ["AssertionError: expected 0 to be 1\n    at x"] }] };

/** A project whose unit runner reports a test that fails, and whose type check reports an error in a source file. */
function project(): string {
  const unit = `const out = process.argv.find((arg) => arg.startsWith("--outputFile=")).slice(13);\nrequire("node:fs").writeFileSync(out, JSON.stringify({ testResults: [${JSON.stringify(FAILING)}] }).replaceAll("<cwd>", process.cwd()));\nprocess.exit(1);\n`;
  const types = `console.log("src/cart.ts(2,3): error TS2322: Type 'string' is not assignable to type 'number'.");\nprocess.exit(2);\n`;
  const progress = { current_focus: null, features: [{ id: "FR-A-01", title: "One", status: "in_progress", cycle_step: "tdd_green", scenarios: [] }] };
  return committedRepo("project", {
    ".outside-in.json": JSON.stringify({ version: 1, stack: "typescript", paths: GATE_PATHS, commands: { ...RUNNER_COMMANDS, unit: "node unit-runner.cjs", typecheck: "node tsc-runner.cjs" } }),
    "progress.json": JSON.stringify(progress),
    ".gitignore": ".outside-in/\n",
    "unit-runner.cjs": unit,
    "tsc-runner.cjs": types,
  });
}

const PAY = { file: "features/pay.feature", line: 3, name: "Pay" };

/** The report of a run in which the scenario "Pay again" fails on its step. */
const PAY_AGAIN_FAILS = [
  { pickle: { id: "p", uri: "features/pay.feature", name: "Pay again", steps: [{ id: "ps", text: "I pay" }] } },
  { testCase: { id: "c", pickleId: "p", testSteps: [{ id: "s", pickleStepId: "ps" }] } },
  { testCaseStarted: { id: "r", testCaseId: "c" } },
  { testStepFinished: { testCaseStartedId: "r", testStepId: "s", testStepResult: { status: "FAILED", message: "TypeError: pay is not a function" } } },
]
  .map((line) => JSON.stringify(line))
  .join("\n");

/** A project with the feature "Pay" (the scenarios "Pay", the current one, and "Pay again", which passed) and another feature whose scenario passed; and runners whose unit suite and type check pass and whose BDD runner fails "Pay again" and keeps what it was asked. */
function featureProject(sibling = "pass"): { repo: string; runners: Runners; asked: string[][] } {
  const progress = { current_focus: null, features: [{ id: "FR-A-01", title: "One", status: "in_progress", cycle_step: "tdd_green", scenarios: [{ name: "Pay", bdd: "fail" }, { name: "Pay again", bdd: sibling }] }, { id: "FR-B-01", title: "Two", status: "done", scenarios: [{ name: "Other", bdd: "pass" }] }] };
  const repo = committedRepo("project", {
    ".outside-in.json": JSON.stringify({ version: 1, stack: "typescript", paths: GATE_PATHS, commands: RUNNER_COMMANDS }),
    "progress.json": JSON.stringify(progress),
    ".gitignore": ".outside-in/\n",
    "features/pay.feature": "@FR-A-01\nFeature: Pay\n  Scenario: Pay\n    When I pay\n\n  Scenario: Pay again\n    When I pay\n",
    "features/other.feature": "@FR-B-01\nFeature: Other\n  Scenario: Other\n    When I act\n",
  });
  const asked: string[][] = [];
  const passed = { name: `${repo}/tests/unit/pay.test.ts`, message: "", assertionResults: [{ fullName: "pay pays", title: "pays", status: "passed", failureMessages: [] }] };
  const runners: Runners = {
    ...REAL_RUNNERS,
    unitSuite: () => ({ exitCode: 0, report: { testResults: [passed] } }),
    typecheck: () => ({ exitCode: 0, output: "" }),
    bddScenarios: (_cwd, _command, scenarios) => {
      asked.push(scenarios.map(({ file, line }) => `${file}:${line}`));
      return { exitCode: 1, report: PAY_AGAIN_FAILS, stderr: "" };
    },
  };
  return { repo, runners, asked };
}

describe("the gate of the code an agent wrote", () => {
  it("runs the scenarios of the feature of the current scenario that passed, and no other, and names the one that no longer passes with its failure", () => {
    const { repo, runners, asked } = featureProject();
    const problems = codeGreenGate(repo, "tdd_green", runners, PAY);
    expect(asked).toEqual([["features/pay.feature:6"]]);
    expect(problems).toEqual([expect.stringMatching(/features\/pay\.feature:6 Pay again: .*pay is not a function/)]);
  });

  it("runs no scenario when none of the feature passed, since a run that names no scenario runs the whole suite", () => {
    const { repo, runners, asked } = featureProject("fail");
    expect(codeGreenGate(repo, "tdd_green", runners, PAY)).toEqual([]);
    expect(asked).toEqual([]);
  });

  it("does not run the scenarios that passed when a unit test fails, the cheaper check having found the problem", () => {
    const { repo, runners, asked } = featureProject();
    const failing = { ...FAILING, name: `${repo}/tests/unit/cart.test.ts`, message: "" };
    const problems = codeGreenGate(repo, "tdd_green", { ...runners, unitSuite: () => ({ exitCode: 1, report: { testResults: [failing] } }) }, PAY);
    expect(problems).toEqual(["unit tests/unit/cart.test.ts > cart adds: AssertionError: expected 0 to be 1"]);
    expect(asked).toEqual([]);
  });

  it("lists the unit tests that fail and the type errors in source files, as the runners print them", () => {
    expect(codeGreenGate(project())).toEqual(["unit tests/unit/cart.test.ts > cart adds: AssertionError: expected 0 to be 1", expect.stringContaining("src/cart.ts(2,3): error TS2322")]);
  });
});
