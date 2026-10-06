import { describe, expect, it } from "vitest";
import { runBddScenarios, runTypecheck, runUnitSuite } from "../../src/artifacts/verify-runner.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

const ARGV_RUNNER = 'import { writeFileSync } from "node:fs";\nconst out = process.argv.find((a) => a.startsWith("--outputFile=")).slice(13);\nwriteFileSync(out, JSON.stringify({ argv: process.argv.slice(2) }));\nprocess.exit(1);\n';

describe("runUnitSuite", () => {
  it("runs the configured command with only the report options appended, and returns its exit code and JSON report", () => {
    write("runner.mjs", ARGV_RUNNER);
    expect(runUnitSuite(dir, "node runner.mjs")).toEqual({ exitCode: 1, report: { argv: ["--reporter=json", "--outputFile=.outside-in/verify/unit.json"] } });
  });
});

describe("runBddScenarios", () => {
  it("runs every scenario location in one command, with the message report option", () => {
    write("runner.mjs", 'import { writeFileSync } from "node:fs";\nconst out = process.argv.find((a) => a.startsWith("message:")).slice(8);\nwriteFileSync(out, process.argv.slice(2).join(" "));\n');
    expect(runBddScenarios(dir, "node runner.mjs", [{ file: "features/a.feature", line: 3 }, { file: "features/b.feature", line: 9 }])).toEqual({
      exitCode: 0,
      report: "features/a.feature:3 features/b.feature:9 --format message:.outside-in/verify/bdd.ndjson",
      stderr: "",
    });
  });
});

describe("runTypecheck", () => {
  it("runs the configured command with --pretty false and returns its exit code and what it printed on stdout", () => {
    write("tsc.mjs", "console.log(process.argv.slice(2).join(' '));\nprocess.exit(2);\n");
    expect(runTypecheck(dir, "node tsc.mjs")).toEqual({ exitCode: 2, output: "--pretty false\n" });
  });
});
