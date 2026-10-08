import { describe, expect, it } from "vitest";
import { gateChecks } from "../../src/orchestrator/gate-checks.js";
import { runMessages } from "./cucumber-run-messages.js";
import { bddRunner, EMPTY_BASELINE, gateProject, PASSING_UNIT } from "./gate-project.js";
import { dir, useTempDir, write, REAL_PROCESS_TIMEOUT_MS } from "./temp-project.js";

useTempDir();

const GREEN_SUITES = { unit: "node unit.cjs", typecheck: "node -e 0", bdd: "node bdd.cjs" };
const GREEN_FILES = { "unit.cjs": PASSING_UNIT, "bdd.cjs": bddRunner(runMessages([{ uri: "features/cart.feature", name: "Add to cart", steps: [{ text: "a cart", status: "PASSED" }] }]), 0) };

describe("the coverage and the extra checks of the quality gate", () => {
  it("put a command that fails to a person with what it printed, coverage first, and pass when every command succeeds", () => {
    const config = gateProject({ ...GREEN_SUITES, coverage: "node coverage.cjs", extra_checks: ["node extra.cjs"] }, { ...GREEN_FILES, "coverage.cjs": 'console.log("lines 71% < 80%");process.exit(1);', "extra.cjs": 'console.error("the bundle is too big");process.exit(2);' });
    expect(gateChecks(dir, config, EMPTY_BASELINE)).toEqual({ kind: "ask", check: "coverage", problems: ['"node coverage.cjs" exited 1', "lines 71% < 80%"], output: "lines 71% < 80%" });
    write("coverage.cjs", "process.exit(0);");
    expect(gateChecks(dir, config, EMPTY_BASELINE)).toEqual({ kind: "ask", check: "extra check", problems: ['"node extra.cjs" exited 2', "the bundle is too big"], output: "the bundle is too big" });
    write("extra.cjs", "process.exit(0);");
    expect(gateChecks(dir, config, EMPTY_BASELINE)).toEqual({ kind: "ok" });
  }, REAL_PROCESS_TIMEOUT_MS);
});
