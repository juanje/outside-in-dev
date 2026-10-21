import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../../src/run-cli.js";
import { dir, useTempDir, writeProgressFile } from "./temp-project.js";

useTempDir();

const AT_BDD_RED = { id: "FR-X-01", title: "Alpha", status: "in_progress", cycle_step: "bdd_red", scenarios: [{ name: "S1", bdd: "pending" }] };

describe("oid progress step with a cause in OID_OVERRIDE", () => {
  it("ignores the variable: a feature with no revise record stays at bdd_red and the cause is not printed", async () => {
    writeProgressFile({ current_focus: null, features: [AT_BDD_RED] });
    let stdout = "";
    let stderr = "";
    const exitCode = await runCli(["progress", "step", "FR-X-01", "quality_gate"], { cwd: dir, stdout: (text) => (stdout += text), stderr: (text) => (stderr += text) }, { env: { OID_OVERRIDE: "the scenarios cover code that exists" } });
    const saved = JSON.parse(readFileSync(join(dir, "progress.json"), "utf8")) as { features: { cycle_step: string }[] };
    expect({ exitCode, step: saved.features[0]!.cycle_step }).toEqual({ exitCode: 1, step: "bdd_red" });
    expect(stderr).toContain("revise");
    expect(stdout + stderr).not.toContain("the scenarios cover code that exists");
  });
});
