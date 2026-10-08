import { describe, expect, it } from "vitest";
import { bddCheck } from "../../src/orchestrator/bdd-check.js";
import { committedRepo } from "./git-fixture.js";
import { GATE_PATHS } from "./gate-paths.js";
import { useTempDir } from "./temp-project.js";

useTempDir();

const RUNNER = `
const out = process.argv[process.argv.indexOf("--format") + 1].slice(8);
const lines = [
  { pickle: { id: "p", uri: "features/pay.feature", name: "Pay", steps: [{ id: "ps", text: "I pay" }] } },
  { testCase: { id: "c", pickleId: "p", testSteps: [{ id: "s", pickleStepId: "ps" }] } },
  { testCaseStarted: { id: "r", testCaseId: "c" } },
  { testStepFinished: { testCaseStartedId: "r", testStepId: "s", testStepResult: { status: "FAILED", message: "TypeError: pay is not a function" } } },
];
require("node:fs").writeFileSync(out, lines.map((line) => JSON.stringify(line)).join("\\n") + "\\n");
`;

describe("the check of a scenario after its code was written", () => {
  it("says the scenario is still red and gives the failure message", () => {
    const feature = { id: "FR-A-01", title: "One", status: "in_progress", cycle_step: "tdd_green", scenarios: [{ name: "Pay", bdd: "fail" }] };
    const repo = committedRepo("project", {
      ".outside-in.json": JSON.stringify({ version: 1, stack: "typescript", paths: GATE_PATHS, commands: { bdd: "node bdd.cjs", unit: "u", typecheck: "t", format: null, lint: null, coverage: null, extra_checks: [] } }),
      "progress.json": JSON.stringify({ current_focus: null, features: [feature] }),
      ".gitignore": ".outside-in/\n",
      "features/pay.feature": "@FR-A-01\nFeature: Pay\n  Scenario: Pay\n    When I pay\n",
      "bdd.cjs": RUNNER,
    });
    expect(bddCheck(repo, { file: "features/pay.feature", line: 3, name: "Pay" })).toEqual({ kind: "red", message: expect.stringContaining("pay is not a function") });
  });
});
