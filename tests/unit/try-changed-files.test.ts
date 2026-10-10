import { rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { changedCodeFiles } from "../../src/artifacts/try-files.js";
import { commitAll } from "./git-fixture.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

describe("changedCodeFiles", () => {
  it("lists the files under the given globs that were modified or are untracked since HEAD, leaving out the ignored, the deleted and the others", () => {
    write(".gitignore", "src/generated.ts\n");
    write("src/a.ts", "export const a = 1;\n");
    write("src/b.ts", "export const b = 1;\n");
    write("src/untouched.ts", "export const u = 1;\n");
    commitAll();
    write("src/a.ts", "export const a = 2;\n");
    rmSync(join(dir, "src/b.ts"));
    write("src/c.ts", "export const c = 1;\n");
    write("src/generated.ts", "export const g = 1;\n");
    write("tests/unit/x.test.ts", "// new\n");
    write("notes.md", "notes\n");
    expect(changedCodeFiles(dir, ["src/**/*.ts", "tests/unit/**/*.test.ts"])).toEqual(["src/a.ts", "src/c.ts", "tests/unit/x.test.ts"]);
  });
});
