import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runInProject } from "./run-capture.js";
import { dir, useTempDir, writeProgressFile } from "./temp-project.js";

useTempDir();

const DONE = { id: "FR-X-01", title: "Alpha", status: "done", scenarios: [{ name: "S1", bdd: "pass" }] };

function savedProgress(): unknown {
  return JSON.parse(readFileSync(join(dir, "progress.json"), "utf8"));
}

describe("oid progress revise", () => {
  it("puts a done feature back at bdd_red with its scenarios pending", async () => {
    writeProgressFile({ current_focus: null, features: [DONE] });
    expect(await runInProject(["progress", "revise", "FR-X-01"])).toEqual({ exitCode: 0, stdout: "", stderr: "" });
    expect(savedProgress()).toEqual({ current_focus: null, features: [{ ...DONE, status: "in_progress", cycle_step: "bdd_red", scenarios: [{ name: "S1", bdd: "pending" }] }] });
  });

  it("refuses a feature that is not tracked", async () => {
    writeProgressFile({ current_focus: null, features: [] });
    const { exitCode, stderr } = await runInProject(["progress", "revise", "FR-MISSING-01"]);
    expect({ exitCode, names: stderr.includes("FR-MISSING-01") }).toEqual({ exitCode: 1, names: true });
  });
});
