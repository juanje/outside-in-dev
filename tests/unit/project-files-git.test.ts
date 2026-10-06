import { describe, expect, it } from "vitest";
import { projectFiles } from "../../features/support/project-files.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

describe("projectFiles and git", () => {
  it("leaves out the .git directory, whose files git changes in the background", () => {
    write("src/a.ts", "export const a = 1;\n");
    write(".git/objects/maintenance.lock", "");
    write(".git/HEAD", "ref: refs/heads/main\n");
    expect([...projectFiles(dir).keys()]).toEqual(["src/a.ts"]);
  });
});
