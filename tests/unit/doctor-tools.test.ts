import { describe, expect, it } from "vitest";

const COMMANDS = { bdd: "node bdd.mjs", unit: "node unit.mjs", typecheck: "tsc --noEmit", format: null, lint: null, coverage: null, extra_checks: [] };

describe("missingTools", () => {
  it("names the tools the shell cannot find from the directory, and a path that is not executable", async () => {
    const { missingTools } = await import("../../src/artifacts/project-tools.js");
    expect(missingTools(process.cwd(), ["node", "no-such-tool-4711", "node_modules/.bin/no-such-binary", "it's-not-there"])).toEqual(["no-such-tool-4711", "node_modules/.bin/no-such-binary", "it's-not-there"]);
    expect(missingTools(process.cwd(), ["node", "git"])).toEqual([]);
  });
});

describe("toolsOf", () => {
  it("names the program of each configured command once, and git, which a run needs", async () => {
    const { toolsOf } = await import("../../src/artifacts/project-tools.js");
    expect(toolsOf(COMMANDS)).toEqual(["git", "node", "tsc"]);
  });

  it("includes the formatter, the linter, the coverage command and the extra checks, skips variable assignments and reads every command of a list", async () => {
    const { toolsOf } = await import("../../src/artifacts/project-tools.js");
    const commands = { bdd: 'NODE_OPTIONS="--import tsx" cucumber-js', unit: "vitest run && echo done", typecheck: "tsc", format: "prettier --write .", lint: "eslint .", coverage: "c8 vitest", extra_checks: ["knip", "NODE_ENV=test jscpd src"] };
    expect(toolsOf(commands)).toEqual(["c8", "cucumber-js", "echo", "eslint", "git", "jscpd", "knip", "prettier", "tsc", "vitest"]);
  });
});
