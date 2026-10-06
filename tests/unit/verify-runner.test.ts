import { describe, expect, it } from "vitest";
import { runUnitTest, unitRunCommand } from "../../src/artifacts/verify-runner.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

describe("unitRunCommand", () => {
  it("appends the test file, the escaped test name and the report options to the configured command", () => {
    expect(unitRunCommand("npx vitest run", { file: "tests/unit/a.test.ts", name: "adds (1 + 1)" }, ".outside-in/verify/unit.json")).toBe(
      "npx vitest run 'tests/unit/a.test.ts' -t 'adds \\(1 \\+ 1\\)' --reporter=json --outputFile='.outside-in/verify/unit.json'",
    );
  });

  it("quotes a single quote of the test name so that the shell passes it on unchanged", () => {
    expect(unitRunCommand("npx vitest run", { file: "a.test.ts", name: "it's" }, "r.json")).toContain("-t 'it'\\''s' ");
  });
});

describe("runUnitTest", () => {
  it("runs the command through the shell in the project with the arguments appended, and returns its exit code and JSON report", () => {
    write("runner.mjs", 'import { writeFileSync } from "node:fs";\nconst out = process.argv.find((a) => a.startsWith("--outputFile=")).slice(13);\nwriteFileSync(out, JSON.stringify({ argv: process.argv.slice(2) }));\nprocess.exit(3);\n');
    const run = runUnitTest(dir, "node runner.mjs", { file: "tests/a.test.ts", name: "adds up" });
    expect(run).toEqual({
      exitCode: 3,
      report: { argv: ["tests/a.test.ts", "-t", "adds up", "--reporter=json", "--outputFile=.outside-in/verify/unit.json"] },
    });
  });

  it("returns no report when the command writes none, whatever an earlier run left", () => {
    write(".outside-in/verify/unit.json", '{"stale":true}');
    expect(runUnitTest(dir, "node -e 0", { file: "a.test.ts", name: "x" })).toEqual({ exitCode: 0, report: undefined });
  });
});
