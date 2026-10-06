import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { projectFiles } from "../../features/support/project-files.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

describe("projectFiles", () => {
  it("lists every file under the project with its content, and does not follow a symbolic link to a directory", () => {
    write("src/a.ts", "export const a = 1;\n");
    write("outside/deps/lib.js", "module.exports = 1;\n");
    mkdirSync(join(dir, "project"));
    write("project/README.md", "# p\n");
    write("project/src/b.ts", "export const b = 2;\n");
    symlinkSync(join(dir, "outside"), join(dir, "project", "node_modules"), "dir");
    expect(projectFiles(join(dir, "project"))).toEqual(
      new Map([
        ["README.md", "# p\n"],
        [join("src", "b.ts"), "export const b = 2;\n"],
      ]),
    );
  });
});
