import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tryBddScenario, tryUnitTest } from "../../src/artifacts/verify-runner.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

describe("tryUnitTest", () => {
  it("runs the unit command for one test, returns its exit code, the JSON report it wrote and its stderr, and leaves nothing in the project", () => {
    write("runner.mjs", 'import { writeFileSync } from "node:fs";\nconst out = process.argv.find((a) => a.startsWith("--outputFile=")).slice(13);\nwriteFileSync(out, JSON.stringify({ argv: process.argv.slice(2, 4) }));\nconsole.error("it broke");\nprocess.exit(3);\n');
    const run = tryUnitTest(dir, "node runner.mjs", { file: "tests/a.test.ts", name: "adds up" });
    expect(run).toEqual({ exitCode: 3, report: { argv: ["tests/a.test.ts", "--testNamePattern=adds up"] }, stderr: "it broke\n" });
    expect(existsSync(join(dir, ".outside-in"))).toBe(false);
  });
});

describe("tryBddScenario", () => {
  const SCENARIO = { file: "features/a.feature", line: 12 };
  const RUNNER = 'import { writeFileSync } from "node:fs";\nconst out = process.argv.find((a) => a.startsWith("message:")).slice(8);\nwriteFileSync(out, process.argv.slice(2).join(" ").replace(out, "<report>"));\nconsole.error("it broke");\nprocess.exit(3);\n';

  it("runs the BDD command for one scenario, with the dry run option when asked, and returns its exit code, the text of the report and its stderr, leaving nothing in the project", () => {
    write("runner.mjs", RUNNER);
    expect(tryBddScenario(dir, "node runner.mjs", SCENARIO, false)).toEqual({ exitCode: 3, report: "features/a.feature:12 --format message:<report>", stderr: "it broke\n" });
    expect(tryBddScenario(dir, "node runner.mjs", SCENARIO, true).report).toBe("features/a.feature:12 --dry-run --format message:<report>");
    expect(existsSync(join(dir, ".outside-in"))).toBe(false);
  });
});
