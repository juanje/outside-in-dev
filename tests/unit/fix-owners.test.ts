import { describe, expect, it } from "vitest";
import type { GateError } from "../../src/artifacts/lint-tools.js";
import { fixGroups } from "../../src/orchestrator/fix-owners.js";
import { GATE_PATHS } from "./gate-paths.js";

const at = (file: string): GateError => ({ kind: "lint", file, line: 1, code: "no-todo", message: "Unexpected TODO comment." });

describe("the owners of the files with errors", () => {
  it("are the coder for source, the test writer for unit tests and the step writer for steps, in that order, and nobody for the rest", () => {
    const errors = [at("features/steps/cart.steps.ts"), at("tests/unit/cart.test.ts"), at("src/cart.ts"), at("README.md"), at("src/totals.ts"), at("")];
    expect(fixGroups(errors, GATE_PATHS)).toEqual({
      groups: [
        { owner: "source files", state: "CODE_GREEN", step: "tdd_green", errors: [at("src/cart.ts"), at("src/totals.ts")] },
        { owner: "unit tests", state: "TDD_RED", step: "tdd_red", errors: [at("tests/unit/cart.test.ts")] },
        { owner: "step definitions", state: "BDD_RED", step: "bdd_red", errors: [at("features/steps/cart.steps.ts")] },
      ],
      unowned: [at("README.md"), at("")],
    });
  });
});
