import { symlinkSync } from "node:fs";
import { join } from "node:path";
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

  it("leaves out, unread, every imported file that is or leads to a secret", () => {
    write("tests/unit/a.test.ts", 'import { a } from "../../src/a.js";\n');
    write("src/a.ts", 'import { l } from "./leak.js";\nimport { b } from "./secrets/b.js";\nimport { c } from "./c.js";\n');
    write(".env", 'import { d } from "./d.js";\n');
    symlinkSync("../.env", join(dir, "src/leak.ts"));
    write("src/secrets/b.ts", 'import { e } from "../e.js";\nexport const b = e;\n');
    write("src/c.ts", "export const c = 1;\n");
    write("src/d.ts", "export const d = 1;\n");
    write("src/e.ts", "export const e = 1;\n");
    expect(importClosure(dir, ["tests/unit/a.test.ts"], ["src/**/*.ts"]).sort()).toEqual(["src/a.ts", "src/c.ts"]);
  });
});
