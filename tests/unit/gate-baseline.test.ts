import { describe, expect, it } from "vitest";
import { errorKey } from "../../src/artifacts/gate-errors.js";
import { gateBaseline } from "../../src/orchestrator/gate-baseline.js";
import { gateProject } from "./gate-project.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

const REPORT = JSON.stringify([{ filePath: "<cwd>/src/cart.ts", messages: [{ ruleId: "no-todo", severity: 2, message: "Unexpected TODO comment.", line: 1, column: 1 }] }]);
const LINTER = `console.log(${JSON.stringify(REPORT)}.replaceAll("<cwd>", process.cwd()));\nprocess.exit(1);\n`;
const TYPECHECK = `console.log("src/cart.ts(2,7): error TS2322: Type 'string' is not assignable to type 'number'.");\nprocess.exit(1);\n`;

describe("the baseline of the quality gate", () => {
  it("holds the identity of the lint errors, the type errors and the traceability violations a project has", () => {
    const config = gateProject({ lint: "node eslint.cjs", typecheck: "node tsc.cjs" }, { "eslint.cjs": LINTER, "tsc.cjs": TYPECHECK, "src/cart.ts": "export const a = 1; // TODO\nexport const b: number = 'x';\n", "features/legacy.feature": "Feature: Legacy\n  Scenario: Untagged\n    Given a cart\n" });
    const baseline = gateBaseline(dir, config);
    expect(baseline.lint).toEqual([errorKey(dir, { kind: "lint", file: "src/cart.ts", line: 1, code: "no-todo", message: "" })]);
    expect(baseline.types).toEqual([errorKey(dir, { kind: "type", file: "src/cart.ts", line: 2, code: "TS2322", message: "" })]);
    expect(baseline.traceability).toEqual([expect.stringContaining("features/legacy.feature")]);
  });

  it("holds nothing for a linter oid does not recognise or one that is not configured", () => {
    const config = gateProject({ lint: "node style.cjs", typecheck: "node -e 0" }, { "style.cjs": "console.log('1 problem');process.exit(1);" });
    expect(gateBaseline(dir, config)).toEqual({ lint: [], types: [], traceability: [] });
  });
});
