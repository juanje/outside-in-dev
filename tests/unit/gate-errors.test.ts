import { describe, expect, it } from "vitest";
import { errorKey, newErrors } from "../../src/artifacts/gate-errors.js";
import type { GateError } from "../../src/artifacts/lint-tools.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

const error = (line: number, code = "no-todo"): GateError => ({ kind: "lint", file: "src/cart.ts", line, code, message: "Unexpected TODO comment." });

describe("the errors a run introduced", () => {
  it("are the ones whose file, code and line text the baseline does not hold, wherever the line moved to", () => {
    write("src/cart.ts", "export const a = 1;\n  // TODO: one\nexport const b = 2; // TODO: two\n");
    const held = new Set([errorKey(dir, error(2))]);
    write("src/cart.ts", "// header\nexport const a = 1;\n// TODO:   one\nexport const b = 2; // TODO: two\n");
    expect(newErrors(dir, [error(3), error(4), error(3, "no-console"), error(99)], held)).toEqual([error(4), error(3, "no-console"), error(99)]);
  });
});
