import { describe, expect, it } from "vitest";
import { gateChecks } from "../../src/orchestrator/gate-checks.js";
import { runMessages } from "./cucumber-run-messages.js";
import { bddRunner, EMPTY_BASELINE, gateProject, PASSING_UNIT } from "./gate-project.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

describe("the BDD suite of the quality gate", () => {
  it("runs every scenario of the project, and puts a failing one of any feature to a person", () => {
    const report = runMessages([
      { uri: "features/cart.feature", name: "Add to cart", steps: [{ text: "a cart", status: "PASSED" }, { text: "I add", status: "FAILED", message: "boom" }] },
      { uri: "features/pay.feature", name: "Pay with a card", steps: [{ text: "a card", status: "PASSED" }] },
    ]);
    const config = gateProject({ unit: "node unit.cjs", typecheck: "node -e 0", bdd: "node bdd.cjs" }, { "unit.cjs": PASSING_UNIT, "bdd.cjs": bddRunner(report, 1) });
    const problem = "bdd features/cart.feature: Add to cart: I add (boom)";
    expect(gateChecks(dir, config, EMPTY_BASELINE)).toEqual({ kind: "ask", check: "bdd", problems: [problem], output: problem });
  });
});

describe("the BDD suite of the quality gate without a report", () => {
  it("is a problem for a person, and so is a runner that fails and names no scenario", () => {
    const silent = gateProject({ unit: "node unit.cjs", typecheck: "node -e 0", bdd: "node silent.cjs" }, { "unit.cjs": PASSING_UNIT, "silent.cjs": "process.exit(0);" });
    expect(gateChecks(dir, silent, EMPTY_BASELINE)).toMatchObject({ kind: "ask", check: "bdd", problems: ["bdd: the runner wrote no report (exit 0)"] });
    const empty = runMessages([{ uri: "features/cart.feature", name: "Add to cart", steps: [{ text: "a cart", status: "PASSED" }] }]);
    const unexplained = gateProject({ unit: "node unit.cjs", typecheck: "node -e 0", bdd: "node bdd.cjs" }, { "unit.cjs": PASSING_UNIT, "bdd.cjs": bddRunner(empty, 1) });
    expect(gateChecks(dir, unexplained, EMPTY_BASELINE)).toMatchObject({ kind: "ask", check: "bdd", problems: ["bdd: the runner exited 1 but its report names no failing scenario"] });
  });
});
