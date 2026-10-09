import { describe, expect, it } from "vitest";
import { recordCheckpoint } from "../../src/artifacts/checkpoint.js";
import { commitAll } from "./git-fixture.js";
import { FEATURE, RED } from "./red-fixture.js";
import { runInProject } from "./run-capture.js";
import { dir, useTempDir, write, writeMinimalConfig, writeProgressFile } from "./temp-project.js";

useTempDir();

const NO_PATHS = { shared: [], bdd_features: [], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" };

/** A project whose feature, at `from`, wrote code after its Red and went back to `to`, with `edited` the one file the fix may change. */
async function goBack({ from, to, edited, paths }: { from: string; to: string; edited: string; paths: { unit_tests: string[]; bdd_steps: string[] } }): Promise<void> {
  writeMinimalConfig({ paths: { source: ["src/**"], ...NO_PATHS, ...paths } });
  writeProgressFile({ current_focus: FEATURE, features: [{ id: FEATURE, title: "Alpha", status: "in_progress", cycle_step: from, scenarios: [] }] });
  write("src/a.ts", "export const a = 1;\n");
  write(edited, "// file\n");
  commitAll();
  recordCheckpoint(dir, RED);
  write("src/a.ts", "export const a = 2;\n");
  await runInProject(["progress", "step", FEATURE, to]);
  write(edited, "// file\n// fixed\n");
}

/** The file may change after the return and integrity is ok; source may not. */
async function expectSourceRefused(): Promise<void> {
  expect(await runInProject(["verify", "integrity"])).toEqual({ exitCode: 0, stdout: "integrity: ok\n", stderr: "" });
  write("src/a.ts", "export const a = 3;\n");
  expect(await runInProject(["verify", "integrity"])).toEqual({ exitCode: 1, stdout: "src/a.ts changed source code while writing tests\n", stderr: "" });
}

describe("oid verify integrity at bdd_red after a return", () => {
  it("judges against the return: step files may change and source may not", async () => {
    await goBack({ from: "tdd_green", to: "bdd_red", edited: "steps/a.ts", paths: { unit_tests: [], bdd_steps: ["steps/**"] } });
    await expectSourceRefused();
  });

  it("at tdd_red after a return from the code steps, unit tests may change and source may not", async () => {
    await goBack({ from: "quality_gate", to: "tdd_red", edited: "tests/a.test.ts", paths: { unit_tests: ["tests/**"], bdd_steps: [] } });
    await expectSourceRefused();
  });
});
