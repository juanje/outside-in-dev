import { describe, expect, it } from "vitest";
import { bddRunCommand, runBddScenario, runUnitTest, unitRunCommand } from "../../src/artifacts/verify-runner.js";
import { resolve } from "node:path";
import { dir, REAL_PROCESS_TIMEOUT_MS, useTempDir, write } from "./temp-project.js";

useTempDir();

describe("unitRunCommand", () => {
  it("appends the test file, the escaped test name, the exclusion of oid's own directory and the report options to the configured command", () => {
    expect(unitRunCommand("npx vitest run", { file: "tests/unit/a.test.ts", name: "adds (1 + 1)" }, ".outside-in/verify/unit.json")).toBe(
      "npx vitest run 'tests/unit/a.test.ts' --testNamePattern='adds \\(1 \\+ 1\\)' --exclude='**/.outside-in/**' --reporter=json --outputFile='.outside-in/verify/unit.json'",
    );
  });

  it("joins the describe titles of a test named as an agent reports it with spaces, the way the runner's name filter wants them", () => {
    expect(unitRunCommand("npx vitest run", { file: "a.test.ts", name: "unitRunCommand > adds up" }, "r.json")).toContain("--testNamePattern='unitRunCommand adds up' ");
  });

  it("quotes a single quote of the test name so that the shell passes it on unchanged", () => {
    expect(unitRunCommand("npx vitest run", { file: "a.test.ts", name: "it's" }, "r.json")).toContain("--testNamePattern='it'\\''s' ");
  });
});

describe("runUnitTest", () => {
  it("runs the command through the shell in the project with the arguments appended, and returns its exit code and JSON report", () => {
    write("runner.mjs", 'import { writeFileSync } from "node:fs";\nconst out = process.argv.find((a) => a.startsWith("--outputFile=")).slice(13);\nwriteFileSync(out, JSON.stringify({ argv: process.argv.slice(2) }));\nprocess.exit(3);\n');
    const run = runUnitTest(dir, "node runner.mjs", { file: "tests/a.test.ts", name: "adds up" });
    expect(run).toEqual({
      exitCode: 3,
      report: { argv: ["tests/a.test.ts", "--testNamePattern=adds up", "--exclude=**/.outside-in/**", "--reporter=json", "--outputFile=.outside-in/verify/unit.json"] },
    });
  });

  it("returns no report when the command writes none, whatever an earlier run left", () => {
    write(".outside-in/verify/unit.json", '{"stale":true}');
    expect(runUnitTest(dir, "node -e 0", { file: "a.test.ts", name: "x" })).toEqual({ exitCode: 0, report: undefined });
  });
});

describe("runUnitTest with vitest", () => {
  const VITEST = `node ${resolve(import.meta.dirname, "../../node_modules/vitest/vitest.mjs")} run`;

  it("runs a test whose name starts with a dash by that name", () => {
    write("vitest.config.mjs", "export default { test: { globals: true } };\n");
    write("a.test.ts", 'it("-starts with a dash", () => {});\nit("another", () => {});\n');
    const { report } = runUnitTest(dir, VITEST, { file: "a.test.ts", name: "-starts with a dash" });
    const results = (report as { testResults?: { assertionResults: { title: string; status: string }[] }[] } | undefined)?.testResults ?? [];
    expect(results.flatMap((file) => file.assertionResults).map(({ title, status }) => ({ title, status }))).toContainEqual({ title: "-starts with a dash", status: "passed" });
  }, REAL_PROCESS_TIMEOUT_MS);
});

describe("bddRunCommand", () => {
  it("appends the feature location and the message report option to the configured command", () => {
    expect(bddRunCommand("npx cucumber-js", { file: "features/a.feature", line: 12 }, ".outside-in/verify/bdd.ndjson")).toBe(
      "npx cucumber-js 'features/a.feature:12' --format message:'.outside-in/verify/bdd.ndjson'",
    );
  });
});

describe("runBddScenario", () => {
  const SCENARIO = { file: "features/a.feature", line: 12 };

  it("runs the command through the shell in the project and returns its exit code, the text of the report and what it printed on stderr", () => {
    write(
      "runner.mjs",
      'import { writeFileSync } from "node:fs";\nconst out = process.argv.find((a) => a.startsWith("message:")).slice(8);\nwriteFileSync(out, process.argv.slice(2).join(" "));\nconsole.error("it broke");\nprocess.exit(3);\n',
    );
    expect(runBddScenario(dir, "node runner.mjs", SCENARIO)).toEqual({
      exitCode: 3,
      report: "features/a.feature:12 --format message:.outside-in/verify/bdd.ndjson",
      stderr: "it broke\n",
    });
  });

  it("returns no report when the command writes none, whatever an earlier run left", () => {
    write(".outside-in/verify/bdd.ndjson", "stale");
    expect(runBddScenario(dir, "node -e 0", SCENARIO)).toEqual({ exitCode: 0, report: undefined, stderr: "" });
  });
});
