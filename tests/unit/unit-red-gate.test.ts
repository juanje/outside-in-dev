import { describe, expect, it } from "vitest";
import { CommandTimeoutError, REAL_RUNNERS, type Runners } from "../../src/artifacts/verify-runner.js";
import { unitRedGate } from "../../src/orchestrator/unit-red-gate.js";
import { committedRepo } from "./git-fixture.js";
import { GATE_PATHS } from "./gate-paths.js";
import { useTempDir } from "./temp-project.js";

useTempDir();

const COMMANDS = { bdd: "b", unit: "node unit.cjs", typecheck: "t", format: null, lint: null, coverage: null, extra_checks: [] };

/** A unit runner that writes the given vitest report, with <cwd> standing for the directory it runs in. */
const runner = (files: object[]) => `
const out = process.argv.find((arg) => arg.startsWith("--outputFile=")).slice(13);
const report = ${JSON.stringify({ testResults: files })};
require("node:fs").writeFileSync(out, JSON.stringify(report).replaceAll("<cwd>", process.cwd()));
`;

const FEATURE = { id: "FR-A-01", title: "One", status: "in_progress", cycle_step: "tdd_red", scenarios: [{ name: "Pay", bdd: "fail" }] };

function project(files: object[]): string {
  const config = { version: 1, stack: "typescript", paths: GATE_PATHS, commands: COMMANDS };
  const texts = [config, { current_focus: null, features: [FEATURE] }].map((document) => JSON.stringify(document));
  return committedRepo("project", { ".outside-in.json": texts[0]!, "progress.json": texts[1]!, ".gitignore": ".outside-in/\n", "tests/unit/old.test.ts": "// old\n", "unit.cjs": runner(files) });
}

const passing = { name: "<cwd>/tests/unit/old.test.ts", message: "", assertionResults: [{ ancestorTitles: [], fullName: "old works", title: "old works", status: "passed", failureMessages: [] }] };

describe("the gate of a unit test in TDD Red", () => {
  it("rejects a unit test that passes at once, with the test as the evidence and the way out as the next action", () => {
    const passes = { name: "<cwd>/tests/unit/cart.test.ts", message: "", assertionResults: [{ ancestorTitles: ["cart lines"], fullName: "cart lines adds a line", title: "adds a line", status: "passed", failureMessages: [] }] };
    const repo = project([passes, passing]);
    expect(unitRedGate(repo, { file: "tests/unit/cart.test.ts", name: "cart lines > adds a line" })).toEqual({
      kind: "problem",
      problem: expect.objectContaining({
        failed: "the Red is not valid (test_bug): the test passes without new implementation",
        evidence: "unit test tests/unit/cart.test.ts > cart lines > adds a line",
        next: "test a behaviour the code does not have yet, or, if no unit logic is left and the scenario still fails, report no_unit_logic_left",
      }),
    });
  });

  it("rejects the attempt when the unit run does not end within its limit, with the command and the limit as the evidence", () => {
    const repo = project([passing]);
    const runners: Runners = { ...REAL_RUNNERS, unitSuite: () => { throw new CommandTimeoutError("node unit.cjs", 5); } };
    expect(unitRedGate(repo, { file: "tests/unit/cart.test.ts", name: "cart lines > adds a line" }, runners)).toEqual({
      kind: "problem",
      problem: expect.objectContaining({ evidence: expect.stringContaining("limits.command_timeout_s"), next: expect.stringContaining("keeps the command from ending") }),
    });
  });

  it("accepts a new unit test whose file fails to load because a source module does not exist yet, while the other tests pass", () => {
    const missing = { name: "<cwd>/tests/unit/cart.test.ts", message: "Cannot find module '../../src/cart.js' imported from '<cwd>/tests/unit/cart.test.ts'", assertionResults: [] };
    const repo = project([missing, passing]);
    expect(unitRedGate(repo, { file: "tests/unit/cart.test.ts", name: "cart lines > adds a line" })).toEqual({ kind: "valid", reason: "the module ../../src/cart.js does not exist yet", message: expect.stringContaining("Cannot find module") });
  });
});
