import { describe, expect, it } from "vitest";
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

describe("the gate of the code an agent wrote", () => {
  it("lists the unit tests that fail and the type errors in source files, as the runners print them", () => {
    expect(codeGreenGate(project())).toEqual(["unit tests/unit/cart.test.ts > cart adds: AssertionError: expected 0 to be 1", expect.stringContaining("src/cart.ts(2,3): error TS2322")]);
  });
});
