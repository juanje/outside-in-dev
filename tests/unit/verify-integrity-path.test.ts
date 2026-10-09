import { describe, expect, it } from "vitest";
import { GATE_PATHS } from "./gate-paths.js";
import { commitAll } from "./git-fixture.js";
import { runInProject } from "./run-capture.js";
import { dir, useTempDir, writeMinimalConfig, writeProgressFile } from "./temp-project.js";

useTempDir();

/** A committed project whose feature FR-X-01 is at `step`, in focus unless `focused` is false. */
function projectAt(step: string, focused = true): void {
  writeMinimalConfig({ paths: GATE_PATHS });
  writeProgressFile({ current_focus: focused ? "FR-X-01" : null, features: [{ id: "FR-X-01", title: "Alpha", status: "in_progress", cycle_step: step, scenarios: [] }] });
  commitAll();
}

const verify = (path: string) => runInProject(["verify", "integrity", "--path", path]);

describe("oid verify integrity --path", () => {
  it("refuses source at tdd_red naming the file, kind, step and the move to tdd_green", async () => {
    projectAt("tdd_red");
    expect(await verify("src/a.ts")).toEqual({
      exitCode: 1,
      stdout: "src/a.ts: source cannot change at tdd_red; verify the Red and move to tdd_green first (oid progress step FR-X-01 tdd_green)\n",
      stderr: "",
    });
  });

  it("refuses a unit test at tdd_green and refactor with the move back to tdd_red", async () => {
    projectAt("tdd_green");
    expect(await verify("tests/unit/a.test.ts")).toEqual({
      exitCode: 1,
      stdout: "tests/unit/a.test.ts: unit test cannot change at tdd_green; go back to tdd_red (oid progress step FR-X-01 tdd_red, ADR-044)\n",
      stderr: "",
    });
    projectAt("refactor");
    expect((await verify("tests/unit/a.test.ts")).stdout).toContain("unit test cannot change at refactor; go back to tdd_red");
  });

  it("refuses a step definitions file and a feature file at tdd_green with the move back to bdd_red", async () => {
    projectAt("tdd_green");
    expect((await verify("features/steps/a.ts")).stdout).toBe("features/steps/a.ts: step cannot change at tdd_green; go back to bdd_red (oid progress step FR-X-01 bdd_red, ADR-038)\n");
    expect((await verify("features/a.feature")).stdout).toBe("features/a.feature: feature cannot change at tdd_green; go back to bdd_red (oid progress step FR-X-01 bdd_red, ADR-038)\n");
  });

  it("allows what the step allows, a file of no kind, no focused feature and a path outside the project", async () => {
    projectAt("tdd_green");
    const ok = { exitCode: 0, stdout: "integrity: ok\n", stderr: "" };
    expect(await verify("src/a.ts")).toEqual(ok);
    expect(await verify("README.md")).toEqual(ok);
    expect(await verify("/elsewhere/src/a.ts")).toEqual(ok);
    projectAt("tdd_red", false);
    expect(await verify("src/a.ts")).toEqual(ok);
  });

  it("judges an absolute path inside the project like the relative one", async () => {
    projectAt("tdd_red");
    const relative = await verify("src/a.ts");
    expect(relative.exitCode).toBe(1);
    expect(await verify(`${dir}/src/a.ts`)).toEqual(relative);
  });
});
