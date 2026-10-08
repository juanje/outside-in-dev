import { describe, expect, it } from "vitest";
import { typeErrors } from "../../src/artifacts/tsc-report.js";

describe("the errors of the output of the type check", () => {
  it("are all of them, in any file, with the path relative to the project, and the ones in no file", () => {
    const output = ["tests/unit/cart.test.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.", "/work/project/src/cart.ts(4,3): error TS2304: Cannot find name 'x'.", "error TS5083: Cannot read file '/work/project/tsconfig.json'.", "some other line"].join("\n");
    expect(typeErrors(output, "/work/project")).toEqual([
      { kind: "type", file: "tests/unit/cart.test.ts", line: 1, code: "TS2322", message: "Type 'string' is not assignable to type 'number'." },
      { kind: "type", file: "src/cart.ts", line: 4, code: "TS2304", message: "Cannot find name 'x'." },
      { kind: "type", file: "", line: 0, code: "TS5083", message: "Cannot read file '/work/project/tsconfig.json'." },
    ]);
  });
});
