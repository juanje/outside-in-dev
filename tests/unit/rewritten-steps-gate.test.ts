import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REAL_RUNNERS, type Runners } from "../../src/artifacts/verify-runner.js";
import { rewrittenStepsGate } from "../../src/orchestrator/rewritten-steps-gate.js";
import { COMMANDS, PATHS } from "./bdd-gate-fixture.js";
import { committedRepo, gitIn } from "./git-fixture.js";
import { useTempDir, write } from "./temp-project.js";

useTempDir();

const SCENARIO = { file: "features/pay.feature", line: 3, name: "Pay" };

/** The failure message each runner gives, as the source of the expression that builds it: a missing module, an assertion of the scenario, a step that breaks. */
const FAILURES = {
  missing: `"Error: Cannot find module '" + process.cwd() + "/src/pay.js' imported from " + process.cwd() + "/features/steps/pay.steps.ts"`,
  assertion: `"AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:\\n\\n2 !== 1\\n\\n    at World.<anonymous> (" + process.cwd() + "/features/steps/pay.steps.ts:5:10)"`,
  never: `"Error: the step could not be set up"`,
};

/** A BDD runner whose scenario "Pay" passes when `src/pay.ts` exists, and when `always` is set whatever the source is; it fails with a missing module otherwise. */
const runner = (always: boolean | "never" | "assertion" | "undefined") => `
const { existsSync, writeFileSync } = require("node:fs");
const out = process.argv[process.argv.indexOf("--format") + 1].slice(8);
const passes = ${always === "never" || always === "assertion" || always === "undefined" ? "false" : always ? "true" : 'existsSync("src/pay.ts")'};
const message = ${FAILURES[always === "assertion" || always === "never" ? always : "missing"]};
const status = ${always === "undefined" ? '{ status: "UNDEFINED" }' : 'passes ? { status: "PASSED" } : { status: "FAILED", message }'};
const lines = [
  { pickle: { id: "p", uri: "features/pay.feature", name: "Pay", steps: [{ id: "ps", text: "I pay" }] } },
  { testCase: { id: "c", pickleId: "p", testSteps: [{ id: "s", pickleStepId: "ps" }] } },
  { testCaseStarted: { id: "r", testCaseId: "c" } },
  { testStepFinished: { testCaseStartedId: "r", testStepId: "s", testStepResult: status } },
];
writeFileSync(out, lines.map((line) => JSON.stringify(line)).join("\\n") + "\\n");
`;

/** A project whose scenario started at the returned commit, with the code of the scenario (src/pay.ts) committed after it. */
function projectWithCode(bdd: string): { repo: string; base: string } {
  const repo = committedRepo("project", {
    ".outside-in.json": JSON.stringify({ version: 1, stack: "typescript", paths: PATHS, commands: COMMANDS }),
    ".gitignore": ".outside-in/\n",
    "progress.json": JSON.stringify({ current_focus: null, features: [{ id: "FR-A-01", title: "One", status: "in_progress", cycle_step: "bdd_red", scenarios: [] }] }),
    "features/pay.feature": "@FR-A-01\nFeature: Pay\n  Scenario: Pay\n    When I pay\n",
    "bdd.cjs": bdd,
  });
  const base = gitIn(repo, "rev-parse", "HEAD");
  write("project/src/pay.ts", "export const pay = 1;\n");
  gitIn(repo, "add", "-A");
  gitIn(repo, "commit", "--quiet", "--message", "the code of the scenario");
  return { repo, base };
}

describe("the gate of steps written again after the code exists", () => {
  it("accepts steps that pass with the code of the scenario and fail without it", () => {
    const { repo, base } = projectWithCode(runner(false));
    expect(rewrittenStepsGate(repo, SCENARIO, {}, base)).toMatchObject({ kind: "valid", reason: "the scenario passes with the code and fails without it" });
    expect(gitIn(repo, "status", "--porcelain")).toBe("");
  });

  it("rejects steps that also pass without the code of the scenario", () => {
    const { repo, base } = projectWithCode(runner(true));
    expect(rewrittenStepsGate(repo, SCENARIO, {}, base)).toEqual({
      kind: "problem",
      problem: expect.objectContaining({
        failed: "the scenario passes without the code of this scenario",
        evidence: 'scenario features/pay.feature:3 "Pay" passed with the code of this scenario taken out',
        next: "make the steps assert the behaviour that the code of this scenario adds, so that the scenario fails without it; check it with the try tool",
      }),
    });
    expect(existsSync(join(repo, "src/pay.ts"))).toBe(true);
  });

  it("rejects steps that fail with the code written so far because the run is broken (a step without definition), without removing the code", () => {
    const { repo, base } = projectWithCode(runner("undefined"));
    expect(rewrittenStepsGate(repo, SCENARIO, {}, base)).toMatchObject({
      kind: "problem",
      problem: { failed: "the scenario does not pass with the code written so far", evidence: expect.stringContaining("Pay"), next: expect.stringContaining("passes with the code that exists") },
    });
    expect(existsSync(join(repo, "src/pay.ts"))).toBe(true);
  });

  it("puts to the person steps that fail with the code written so far on an error oid cannot classify, marked as failing with the code, and keeps the code", () => {
    const { repo, base } = projectWithCode(runner("never"));
    expect(rewrittenStepsGate(repo, SCENARIO, {}, base)).toMatchObject({
      kind: "decision",
      reason: "the test failed with an error that is not an assertion",
      message: expect.stringContaining("the step could not be set up"),
      withCode: true,
    });
    expect(existsSync(join(repo, "src/pay.ts"))).toBe(true);
  });

  it("accepts steps that fail with the code written so far on an assertion of the scenario as a Red, and keeps the code", () => {
    const { repo, base } = projectWithCode(runner("assertion"));
    write("project/features/steps/pay.steps.ts", "// the steps written again\n\n\n\nassert.equal(lines, 1);\n");
    expect(rewrittenStepsGate(repo, SCENARIO, {}, base)).toEqual({
      kind: "valid",
      reason: "the rewritten steps fail with the code written so far on an assertion of the scenario: the steps are right and the code is not",
      message: expect.stringContaining("2 !== 1"),
      withCode: true,
    });
    expect(existsSync(join(repo, "src/pay.ts"))).toBe(true);
  });

  it("leaves the code as it found it when the run without the code throws", () => {
    const { repo, base } = projectWithCode(runner(false));
    let calls = 0;
    const breaking: Runners = {
      ...REAL_RUNNERS,
      bddScenarios: (...args) => {
        calls += 1;
        if (calls === 2) throw new Error("the runner broke");
        return REAL_RUNNERS.bddScenarios(...args);
      },
    };
    expect(() => rewrittenStepsGate(repo, SCENARIO, {}, base, breaking)).toThrow("the runner broke");
    expect(existsSync(join(repo, "src/pay.ts"))).toBe(true);
    expect(gitIn(repo, "status", "--porcelain")).toBe("");
  });
});
