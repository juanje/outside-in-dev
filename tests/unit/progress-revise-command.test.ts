import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commitAll } from "./git-fixture.js";
import { runInProject } from "./run-capture.js";
import { dir, REAL_PROCESS_TIMEOUT_MS, useTempDir, writeProgressFile } from "./temp-project.js";

useTempDir();

const DONE = { id: "FR-X-01", title: "Alpha", status: "done", scenarios: [{ name: "S1", bdd: "pass" }] };

function savedProgress(): unknown {
  return JSON.parse(readFileSync(join(dir, "progress.json"), "utf8"));
}

describe("oid progress reopen", () => {
  it("puts a done feature back at quality_gate and keeps the focus and the scenarios", async () => {
    writeProgressFile({ current_focus: "FR-X-01", features: [DONE] });
    expect(await runInProject(["progress", "reopen", "FR-X-01"])).toEqual({ exitCode: 0, stdout: "", stderr: "" });
    expect(savedProgress()).toEqual({ current_focus: "FR-X-01", features: [{ ...DONE, status: "in_progress", cycle_step: "quality_gate" }] });
  });
});

describe("oid progress revise", () => {
  it("puts a done feature back at bdd_red with its scenarios pending", async () => {
    writeProgressFile({ current_focus: null, features: [DONE] });
    expect(await runInProject(["progress", "revise", "FR-X-01"])).toEqual({ exitCode: 0, stdout: "FR-X-01: bdd_red, 1 scenarios pending\n", stderr: "" });
    expect(savedProgress()).toEqual({ current_focus: null, features: [{ ...DONE, status: "in_progress", cycle_step: "bdd_red", scenarios: [{ name: "S1", bdd: "pending" }] }] });
  });

  it("refuses a feature that is not tracked", async () => {
    writeProgressFile({ current_focus: null, features: [] });
    const { exitCode, stderr } = await runInProject(["progress", "revise", "FR-MISSING-01"]);
    expect({ exitCode, names: stderr.includes("FR-MISSING-01") }).toEqual({ exitCode: 1, names: true });
  });

  it("records the scenarios of the feature in a git project, and the next step forgets them", { timeout: REAL_PROCESS_TIMEOUT_MS }, async () => {
    writeProgressFile({ current_focus: null, features: [DONE] });
    commitAll();
    const { readRevise } = await import("../../src/artifacts/revise-record.js");
    await runInProject(["progress", "revise", "FR-X-01"]);
    expect(readRevise(dir, "FR-X-01")?.scenarios.map(({ name }) => name)).toEqual(["S1"]);
    await runInProject(["progress", "step", "FR-X-01", "tdd_red"]);
    expect(readRevise(dir, "FR-X-01")).toBeUndefined();
  });
});
