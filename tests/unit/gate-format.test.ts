import { describe, expect, it } from "vitest";
import { gateChecks } from "../../src/orchestrator/gate-checks.js";
import { EMPTY_BASELINE, gateProject } from "./gate-project.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

const FAILS = 'console.log("[warn] src/a.ts");process.exit(1);';

describe("the format check of the quality gate", () => {
  it("is an error of oid when a formatter it recognises still finds files after the fixes, and a question when it does not recognise the tool", () => {
    const prettier = gateProject({ format: "node prettier.cjs" }, { "prettier.cjs": FAILS });
    expect(gateChecks(dir, prettier, EMPTY_BASELINE)).toEqual({ kind: "internal", problem: expect.stringContaining("[warn] src/a.ts") });
    const other = gateProject({ format: "node tidy.cjs" }, { "tidy.cjs": FAILS });
    expect(gateChecks(dir, other, EMPTY_BASELINE)).toEqual({ kind: "ask", check: "format", problems: ['"node tidy.cjs" exited 1', "[warn] src/a.ts"], output: "[warn] src/a.ts" });
    const linter = gateProject({ lint: "node style.cjs" }, { "style.cjs": FAILS });
    expect(gateChecks(dir, linter, EMPTY_BASELINE)).toEqual({ kind: "ask", check: "lint", problems: ['"node style.cjs" exited 1', "[warn] src/a.ts"], output: "[warn] src/a.ts" });
  });
});
