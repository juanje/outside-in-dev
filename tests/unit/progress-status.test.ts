import { describe, expect, it } from "vitest";
import { useTempDir, writeProgressFile } from "./temp-project.js";
import { runInProject as run } from "./run-capture.js";

useTempDir();

function writeProgress(features: unknown[], focus: string | null = null) {
  writeProgressFile({ current_focus: focus, features });
}

const DONE = (id: string) => ({ id, title: `Title of ${id}`, status: "done", scenarios: [{ name: "Works", bdd: "pass" }] });
const STARTED = { id: "FR-X-03", title: "Gamma", status: "in_progress", cycle_step: "tdd_red", scenarios: [] };
const PENDING = { id: "FR-X-04", title: "Delta", status: "pending" };

describe("oid progress status", () => {
  it("lists the features that are not done in file order, then the number of done features", async () => {
    writeProgress([DONE("FR-X-01"), STARTED, DONE("FR-X-02"), PENDING], "FR-X-03");
    const { exitCode, stdout } = await run(["progress", "status"]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("FR-X-03  Gamma  in_progress tdd_red (focused)\nFR-X-04  Delta  pending\n2 done\n");
  });
});

describe("oid progress status --help", () => {
  it("documents the --all option and shows it in the usage line", async () => {
    const { exitCode, stdout, stderr } = await run(["progress", "status", "--help"]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("usage: oid progress status [--all]");
    expect(stdout).toMatch(/^\s*--all\s{2,}\S/m);
  });
});

describe("oid progress status summary", () => {
  it("says status lists the features that are not done and that --all lists every one", async () => {
    const { stdout } = await run(["progress", "status", "--help"]);
    expect(stdout).toMatch(/^List the features that are not done/);
    expect(stdout).toMatch(/^\s*--all\s{2,}List every tracked feature/m);
  });
});
