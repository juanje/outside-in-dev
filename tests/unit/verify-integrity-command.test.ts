import { rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commitAll, git } from "./git-fixture.js";
import { runInProject } from "./run-capture.js";
import { dir, useTempDir, write, writeMinimalConfig, writeProgressFile } from "./temp-project.js";

useTempDir();

const PATHS = {
  source: ["src/**/*.ts"],
  shared: [],
  unit_tests: ["tests/unit/**/*.test.ts"],
  bdd_features: ["features/**/*.feature"],
  bdd_steps: ["features/steps/**/*.ts"],
  docs: [],
  spec: "SPEC.md",
  design: [],
  progress: "progress.json",
};

/** A committed project whose feature FR-X-01 is at `step`, in focus unless `focused` is false. */
function projectAt(step: string, focused = true): void {
  writeMinimalConfig({ paths: PATHS });
  writeProgressFile({ current_focus: focused ? "FR-X-01" : null, features: [{ id: "FR-X-01", title: "Alpha", status: "in_progress", cycle_step: step, scenarios: [] }] });
  write("src/a.ts", "export const a = 1;\n");
  write("tests/unit/a.test.ts", "// test\n");
  commitAll();
}

describe("oid verify integrity", () => {
  it("says ok when nothing broke a rule of the step of the focused feature, and lists each violation with exit 1 when something did", async () => {
    projectAt("tdd_red");
    write("tests/unit/a.test.ts", "// test\n// more\n");
    expect(await runInProject(["verify", "integrity"])).toEqual({ exitCode: 0, stdout: "integrity: ok\n", stderr: "" });
    write("src/a.ts", "export const a = 2;\n");
    expect(await runInProject(["verify", "integrity"])).toEqual({ exitCode: 1, stdout: "src/a.ts changed source code while writing tests\n", stderr: "" });
  });

  it("takes the step of --step over the focused one, and asks for a step when none is focused or the one given is not a step", async () => {
    projectAt("tdd_red", false);
    write("src/a.ts", "export const a = 2;\n");
    const run = async (...args: string[]) => {
      const { exitCode, stdout, stderr } = await runInProject(["verify", "integrity", ...args]);
      return { exitCode, stdout, stderr };
    };
    expect(await run()).toEqual({ exitCode: 1, stdout: "", stderr: "error: no feature is focused: give the step with --step <step>\n" });
    expect(await run("--step", "tdd_green")).toEqual({ exitCode: 0, stdout: "integrity: ok\n", stderr: "" });
    expect(await run("--step", "bogus")).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "error: unknown step bogus; valid steps: select, bdd_red, tdd_red, tdd_green, refactor, quality_gate\n",
    });
  });

  it("counts a deleted test, and a deleted approved feature file, as changes", async () => {
    projectAt("quality_gate");
    write("features/a.feature", "@FR-X-01\nFeature: Alpha\n\n  Scenario: One\n    Given a\n");
    git("add", "-A");
    git("commit", "--quiet", "--message", "feature");
    rmSync(join(dir, "features/a.feature"));
    rmSync(join(dir, "tests/unit/a.test.ts"));
    expect(await runInProject(["verify", "integrity", "--step", "tdd_green"])).toEqual({
      exitCode: 1,
      stdout: "features/a.feature changed a test while writing code\ntests/unit/a.test.ts changed a test while writing code\n",
      stderr: "",
    });
    expect((await runInProject(["verify", "integrity"])).stdout).toBe("features/a.feature changed an approved feature file\n");
  });
});
