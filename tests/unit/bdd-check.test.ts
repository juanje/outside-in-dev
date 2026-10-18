import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadProjectConfig } from "../../src/artifacts/project-config.js";
import { runBddScenario } from "../../src/artifacts/verify-runner.js";
import { classifyObservation, observeBddRun } from "../../src/commands/verify.js";
import { bddCheck } from "../../src/orchestrator/bdd-check.js";
import { committedRepo } from "./git-fixture.js";
import { GATE_PATHS } from "./gate-paths.js";
import { useTempDir } from "./temp-project.js";

useTempDir();

const runnerWith = (result: string) => `
const out = process.argv[process.argv.indexOf("--format") + 1].slice(8);
const lines = [
  { pickle: { id: "p", uri: "features/pay.feature", name: "Pay", steps: [{ id: "ps", text: "I pay" }] } },
  { testCase: { id: "c", pickleId: "p", testSteps: [{ id: "s", pickleStepId: "ps" }] } },
  { testCaseStarted: { id: "r", testCaseId: "c" } },
  { testStepFinished: { testCaseStartedId: "r", testStepId: "s", testStepResult: ${result} } },
];
require("node:fs").writeFileSync(out, lines.map((line) => JSON.stringify(line)).join("\\n") + "\\n");
`;

const RUNNER = runnerWith('{ status: "FAILED", message: "TypeError: pay is not a function" }');

describe("the check of a scenario after its code was written", () => {
  const PAY = { file: "features/pay.feature", line: 3, name: "Pay" };

  function repoWith(runner: string): string {
    const feature = { id: "FR-A-01", title: "One", status: "in_progress", cycle_step: "tdd_green", scenarios: [{ name: "Pay", bdd: "fail" }] };
    return committedRepo("project", {
      ".outside-in.json": JSON.stringify({ version: 1, stack: "typescript", paths: GATE_PATHS, commands: { bdd: "node bdd.cjs", unit: "u", typecheck: "t", format: null, lint: null, coverage: null, extra_checks: [] } }),
      "progress.json": JSON.stringify({ current_focus: null, features: [feature] }),
      ".gitignore": ".outside-in/\n",
      "features/pay.feature": "@FR-A-01\nFeature: Pay\n  Scenario: Pay\n    When I pay\n",
      "bdd.cjs": runner,
    });
  }

  it("says the scenario is still red and gives the failure message", () => {
    expect(bddCheck(repoWith(RUNNER), PAY)).toEqual({ kind: "red", message: expect.stringContaining("pay is not a function") });
  });

  it("runs the current scenario only, not the scenarios that passed, whether of its feature or of another", () => {
    const recording = `require("node:fs").writeFileSync("argv.json", JSON.stringify(process.argv));\n${RUNNER}`;
    const scenarios = [{ name: "Pay", bdd: "fail" }, { name: "Pay again", bdd: "pass" }];
    const repo = committedRepo("project", {
      ".outside-in.json": JSON.stringify({ version: 1, stack: "typescript", paths: GATE_PATHS, commands: { bdd: "node bdd.cjs", unit: "u", typecheck: "t", format: null, lint: null, coverage: null, extra_checks: [] } }),
      "progress.json": JSON.stringify({ current_focus: null, features: [{ id: "FR-A-01", title: "One", status: "in_progress", cycle_step: "tdd_green", scenarios }, { id: "FR-B-01", title: "Two", status: "done",scenarios: [{ name: "Other", bdd: "pass" }] }] }),
      ".gitignore": ".outside-in/\nargv.json\n",
      "features/pay.feature": "@FR-A-01\nFeature: Pay\n  Scenario: Pay\n    When I pay\n\n  Scenario: Pay again\n    When I pay\n",
      "features/other.feature": "@FR-B-01\nFeature: Other\n  Scenario: Other\n    When I act\n",
      "bdd.cjs": recording,
    });
    bddCheck(repo, PAY);
    const asked = existsSync(join(repo, "argv.json")) ? readFileSync(join(repo, "argv.json"), "utf8") : "the runner was not run";
    expect(asked).toContain("features/pay.feature:3");
    expect(asked).not.toContain("features/pay.feature:6");
    expect(asked).not.toContain("features/other.feature");
  });

  it("rejects a scenario that neither passes nor fails with an error, with the classifier's reason for what the run showed, the scenario and a next action", () => {
    const repo = repoWith(runnerWith('{ status: "UNDEFINED" }'));
    const config = loadProjectConfig(repo);
    const run = runBddScenario(repo, config.commands.bdd, PAY);
    const observation = observeBddRun(repo, config, PAY, run);
    const checked = bddCheck(repo, PAY);
    expect(checked).toEqual({ kind: "problem", problem: expect.anything() });
    const { problem } = checked as Extract<typeof checked, { kind: "problem" }>;
    expect(problem.failed).toBe(classifyObservation(repo, config, observation).reason);
    expect(problem.failed).toContain("UNDEFINED");
    expect(problem.evidence).toContain(PAY.file);
    expect(problem.evidence).toContain(PAY.name);
    expect(problem.next.length).toBeGreaterThan(0);
  });
});
