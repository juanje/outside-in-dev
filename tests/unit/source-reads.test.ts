import { describe, expect, it } from "vitest";
import { sourceReadLines } from "../../src/artifacts/source-reads.js";
import { isInsideSource } from "../../src/artifacts/source-roots.js";

const FILE = "tests/unit/a.test.ts";
const isSource = (path: string) => isInsideSource(["src/**"], path);

describe("sourceReadLines", () => {
  it("is the lines of the readFileSync calls whose path is inside the source directories, and only those", () => {
    const text = [
      'import { readFileSync } from "node:fs";',
      'import fs from "node:fs";',
      'import { join } from "node:path";',
      'const a = readFileSync("../../src/a.ts", "utf8");',
      'const b = readFileSync("../fixtures/names.txt", "utf8");',
      'const c = fs.readFileSync(join(process.cwd(), "src/c.ts"), "utf8");',
      'const d = readFileSync(new URL("../../src/d.ts", import.meta.url), "utf8");',
      'const E = "../../src/e.ts";',
      "const e = readFileSync(E, 'utf8');",
      'const f = readFileSync(join(process.cwd(), "package.json"), "utf8");',
    ].join("\n");
    expect(sourceReadLines(text, FILE, isSource)).toEqual([4, 6, 7, 9]);
  });
});
