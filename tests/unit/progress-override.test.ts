import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../../src/run-cli.js";
import { dir, useTempDir, writeProgressFile } from "./temp-project.js";

useTempDir();

const AT_BDD_RED = { id: "FR-X-01", title: "Alpha", status: "in_progress", cycle_step: "bdd_red", scenarios: [{ name: "S1", bdd: "pending" }] };

describe("oid progress step with a cause in OID_OVERRIDE", () => {
  it("moves a feature with no revise record from bdd_red to quality_gate and prints the cause", async () => {
    writeProgressFile({ current_focus: null, features: [AT_BDD_RED] });
    let stdout = "";
    const exitCode = await runCli(["progress", "step", "FR-X-01", "quality_gate"], { cwd: dir, stdout: (text) => (stdout += text), stderr: () => undefined }, { env: { OID_OVERRIDE: "the scenarios cover code that exists" } });
    const saved = JSON.parse(readFileSync(join(dir, "progress.json"), "utf8")) as { features: { cycle_step: string }[] };
    expect({ exitCode, step: saved.features[0]!.cycle_step }).toEqual({ exitCode: 0, step: "quality_gate" });
    expect(stdout).toContain("the scenarios cover code that exists");
  });
});
