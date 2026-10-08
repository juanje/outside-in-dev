import { describe, expect, it } from "vitest";
import { recordCheckpoint } from "../../src/artifacts/checkpoint.js";
import { commitAll } from "./git-fixture.js";
import { FEATURE, RED } from "./red-fixture.js";
import { runInProject } from "./run-capture.js";
import { dir, useTempDir, write, writeMinimalConfig, writeProgressFile } from "./temp-project.js";

useTempDir();

describe("oid verify integrity at bdd_red after a return", () => {
  it("judges against the return: step files may change and source may not", async () => {
    writeMinimalConfig({ paths: { source: ["src/**"], shared: [], unit_tests: [], bdd_features: [], bdd_steps: ["steps/**"], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" } });
    writeProgressFile({ current_focus: FEATURE, features: [{ id: FEATURE, title: "Alpha", status: "in_progress", cycle_step: "tdd_green", scenarios: [] }] });
    write("src/a.ts", "export const a = 1;\n");
    write("steps/a.ts", "// step\n");
    commitAll();
    recordCheckpoint(dir, RED);
    write("src/a.ts", "export const a = 2;\n");
    await runInProject(["progress", "step", FEATURE, "bdd_red"]);
    write("steps/a.ts", "// step\n// fixed\n");
    expect(await runInProject(["verify", "integrity"])).toEqual({ exitCode: 0, stdout: "integrity: ok\n", stderr: "" });
    write("src/a.ts", "export const a = 3;\n");
    expect(await runInProject(["verify", "integrity"])).toEqual({ exitCode: 1, stdout: "src/a.ts changed source code while writing tests\n", stderr: "" });
  });
});
