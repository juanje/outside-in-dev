import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runInProject } from "./run-capture.js";
import { dir, useTempDir, writeProgressFile } from "./temp-project.js";

useTempDir();

const FEATURE = { id: "FR-X-01", title: "Alpha", status: "in_progress", cycle_step: "bdd_red" };

function savedProgress(): unknown {
  return JSON.parse(readFileSync(join(dir, "progress.json"), "utf8"));
}

describe("oid progress scenario drop and unfocus", () => {
  it("drops a pending scenario with oid progress scenario drop", async () => {
    writeProgressFile({ current_focus: null, features: [{ ...FEATURE, scenarios: [{ name: "S1", bdd: "pending" }] }] });
    expect(await runInProject(["progress", "scenario", "drop", "FR-X-01", "S1"])).toEqual({ exitCode: 0, stdout: "", stderr: "" });
    expect(savedProgress()).toEqual({ current_focus: null, features: [{ ...FEATURE, scenarios: [] }] });
  });

  it("clears the focus with oid progress unfocus, also when it is on a feature that is done", async () => {
    const done = { id: "FR-X-01", title: "Alpha", status: "done", scenarios: [{ name: "S1", bdd: "pass" }] };
    writeProgressFile({ current_focus: "FR-X-01", features: [done] });
    expect(await runInProject(["progress", "unfocus"])).toEqual({ exitCode: 0, stdout: "", stderr: "" });
    expect(savedProgress()).toEqual({ current_focus: null, features: [done] });
  });
});
