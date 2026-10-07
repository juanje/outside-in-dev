import { describe, expect, it } from "vitest";
import { importClosure } from "../../src/agents/context/import-closure.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

describe("import closure", () => {
  it("follows relative imports transitively, stays inside the source paths and ignores packages", () => {
    write("tests/unit/a.test.ts", 'import { a } from "../../src/a.js";\nimport { helper } from "./helper.js";\nimport { it } from "vitest";\n');
    write("tests/unit/helper.ts", "export const helper = 1;\n");
    write("src/a.ts", 'import { b } from "./deep/b.js";\nimport { z } from "zod";\nexport const a = b;\n');
    write("src/deep/b.ts", 'import { a } from "../a.js";\nexport { c } from "./c.js";\nexport const b = a;\n');
    write("src/deep/c.ts", "export const c = 1;\n");
    write("src/unrelated.ts", "export const u = 1;\n");
    expect(importClosure(dir, ["tests/unit/a.test.ts"], ["src/**/*.ts"]).sort()).toEqual(["src/a.ts", "src/deep/b.ts", "src/deep/c.ts"]);
  });
});
