import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gateChecks } from "../../src/orchestrator/gate-checks.js";
import { EMPTY_BASELINE, gateProject, MARKER } from "./gate-project.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

const FAILING = { name: "<cwd>/tests/unit/cart.test.ts", message: "", assertionResults: [{ fullName: "cart adds", title: "adds", status: "failed", failureMessages: ["AssertionError: expected 0 to be 1\n    at x"] }] };
const UNIT = `const out = process.argv.find((arg) => arg.startsWith("--outputFile=")).slice(13);\nrequire("node:fs").writeFileSync(out, JSON.stringify({ testResults: [${JSON.stringify(FAILING)}] }).replaceAll("<cwd>", process.cwd()));\nprocess.exit(1);\n`;

describe("the unit suite of the quality gate", () => {
  it("puts a failing test to a person, with the failure, and stops before the BDD suite", () => {
    const config = gateProject({ unit: "node unit.cjs", typecheck: "node -e 0" }, { "unit.cjs": UNIT });
    const outcome = gateChecks(dir, config, EMPTY_BASELINE);
    const problem = "unit tests/unit/cart.test.ts > cart adds: AssertionError: expected 0 to be 1";
    expect(outcome).toEqual({ kind: "ask", check: "unit", problems: [problem], output: problem });
    expect(existsSync(join(dir, MARKER))).toBe(false);
  });
});
