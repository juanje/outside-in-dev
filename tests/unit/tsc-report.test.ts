import { describe, expect, it } from "vitest";
import { typeProblems } from "../../src/artifacts/tsc-report.js";

const OUTPUT = [
  "src/a.ts(2,3): error TS2322: Type 'number' is not assignable to type 'string'.",
  "  Type 'x' is not assignable to type 'y'.",
  "tests/unit/a.test.ts(1,1): error TS2304: Cannot find name 'x'.",
  "/p/src/nested/b.ts(10,5): error TS7006: Parameter 'n' implicitly has an 'any' type.",
  "",
].join("\n");

describe("typeProblems", () => {
  it("lists the errors located in source files with their line, code and first line of message, by path from the project", () => {
    expect(typeProblems(OUTPUT, "/p", (path) => path.startsWith("src/"))).toEqual([
      "type src/a.ts:2 TS2322 Type 'number' is not assignable to type 'string'.",
      "type src/nested/b.ts:10 TS7006 Parameter 'n' implicitly has an 'any' type.",
    ]);
  });

  it("lists an error that is located in no file, such as a configuration error, whatever the paths", () => {
    expect(typeProblems("error TS5083: Cannot read file '/p/tsconfig.json'.\n", "/p", () => false)).toEqual(["type TS5083 Cannot read file '/p/tsconfig.json'."]);
  });
});
