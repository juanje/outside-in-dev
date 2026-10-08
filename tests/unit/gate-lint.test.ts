import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { errorKey } from "../../src/artifacts/gate-errors.js";
import { gateChecks } from "../../src/orchestrator/gate-checks.js";
import { EMPTY_BASELINE, gateProject, MARKER } from "./gate-project.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

const SOURCE = "export const a = 1; // TODO: inherited\nexport const b = 2; // TODO: new\n";
const message = (line: number) => ({ ruleId: "no-todo", severity: 2, message: "Unexpected TODO comment.", line, column: 1 });
const REPORT = JSON.stringify([{ filePath: "<cwd>/src/cart.ts", messages: [message(1), message(2)] }]);
const LINTER = `console.log(${JSON.stringify(REPORT)}.replaceAll("<cwd>", process.cwd()));\nprocess.exit(1);\n`;

describe("the lint check of the quality gate", () => {
  it("sends the errors the baseline does not hold to a fix, and stops before the checks that cost more", () => {
    const config = gateProject({ lint: "node eslint.cjs" }, { "eslint.cjs": LINTER, "src/cart.ts": SOURCE });
    const inherited = { kind: "lint" as const, file: "src/cart.ts", line: 1, code: "no-todo", message: "Unexpected TODO comment." };
    const outcome = gateChecks(dir, config, { ...EMPTY_BASELINE, lint: [errorKey(dir, inherited)] });
    expect(outcome).toEqual({ kind: "fix", errors: [{ ...inherited, line: 2 }], output: expect.stringContaining('"ruleId":"no-todo"') });
    expect(existsSync(join(dir, MARKER))).toBe(false);
  });
});

const OUTPUT = ["src/cart.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.", "tests/unit/cart.test.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'."].join("\n");
const TYPECHECK = `console.log(${JSON.stringify(OUTPUT)});\nprocess.exit(1);\n`;

describe("the type check of the quality gate", () => {
  it("sends the errors the baseline does not hold, in any file of the project, to a fix, and stops before the suites", () => {
    const config = gateProject({ typecheck: "node tsc.cjs" }, { "tsc.cjs": TYPECHECK, "src/cart.ts": "export const a: number = 'x';\n", "tests/unit/cart.test.ts": "const b: number = 'y';\n" });
    const inherited = { kind: "type" as const, file: "src/cart.ts", line: 1, code: "TS2322", message: "Type 'string' is not assignable to type 'number'." };
    const outcome = gateChecks(dir, config, { ...EMPTY_BASELINE, types: [errorKey(dir, inherited)] });
    expect(outcome).toEqual({ kind: "fix", errors: [{ kind: "type", file: "tests/unit/cart.test.ts", line: 1, code: "TS2322", message: "Type 'string' is not assignable to type 'number'." }], output: OUTPUT });
    expect(existsSync(join(dir, MARKER))).toBe(false);
  });
});
