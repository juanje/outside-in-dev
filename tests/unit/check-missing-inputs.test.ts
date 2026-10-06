import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dir, useTempDir } from "./temp-project.js";
import { runOid } from "./run-capture.js";

useTempDir();

async function run(args: string[]) {
  const { exitCode, stdout } = await runOid(args, dir);
  return { exitCode, stdout };
}

describe("oid check without SPEC.md", () => {
  it("reports a spec violation and exits 1", async () => {
    expect(await run(["check"])).toEqual({ exitCode: 1, stdout: "SPEC.md not found\n" });
  });
});

describe("oid check with a feature file that has a Gherkin syntax error", () => {
  it("prints one line naming the file, without an empty scenario name", async () => {
    writeFileSync(join(dir, "SPEC.md"), "### FR-X-01: Alpha\n\nThe tool does alpha.\n");
    mkdirSync(join(dir, "features"));
    writeFileSync(join(dir, "features", "broken.feature"), "Feature x\n");
    const { exitCode, stdout } = await run(["check"]);
    expect(exitCode).toBe(1);
    expect(stdout).toMatch(/^features\/broken\.feature: Gherkin syntax error: .+\n$/);
  });
});
