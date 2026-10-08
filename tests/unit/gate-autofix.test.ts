import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { autofix } from "../../src/orchestrator/gate-autofix.js";
import { gateProject } from "./gate-project.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

const TOOL = (name: string) => `require("node:fs").appendFileSync("log.txt", ${JSON.stringify(name)} + " " + process.argv.slice(2).join(" ") + "\\n");\nprocess.exit(1);\n`;

describe("the autofix of the quality gate", () => {
  it("runs the fixing invocation of the linter and then the formatter, whatever their exit codes", () => {
    const config = gateProject({ lint: "node eslint.cjs", format: "node prettier.cjs" }, { "eslint.cjs": TOOL("eslint"), "prettier.cjs": TOOL("prettier") });
    autofix(dir, config);
    expect(readFileSync(join(dir, "log.txt"), "utf8")).toBe("eslint --fix\nprettier --write\n");
  });

  it("runs nothing for a project with no formatter and no linter", () => {
    autofix(dir, gateProject({}));
    expect(() => readFileSync(join(dir, "log.txt"), "utf8")).toThrow(/ENOENT/);
  });
});
