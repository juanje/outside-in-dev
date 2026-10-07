import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { recordCheckpoint } from "../../src/artifacts/checkpoint.js";
import { commitAll } from "./git-fixture.js";
import { runInProject as run } from "./run-capture.js";
import { dir, useTempDir, write, writeProgressFile } from "./temp-project.js";

useTempDir();

const PROGRESS = {
  current_focus: "FR-X-01",
  features: [{ id: "FR-X-01", title: "Alpha", status: "in_progress", cycle_step: "bdd_red", scenarios: [{ name: "Alpha works", bdd: "fail" }] }],
};
const GREEN = { step: "tdd_green", feature: "FR-X-01", verify: { kind: "green", target: "all" }, external: false, date: new Date(0) };
const RED = { ...GREEN, step: "tdd_red", verify: { kind: "red", target: "t" } };
const ALPHA = { feature: "FR-X-01", name: "Alpha works" };
const PASS = ["progress", "scenario", "pass", "FR-X-01", "Alpha works"];

function startProject(): void {
  write("src/a.ts", "export const a = 1;\n");
  writeProgressFile(PROGRESS);
  commitAll();
}

function recordedStatus(): string {
  const progress = JSON.parse(readFileSync(join(dir, "progress.json"), "utf8"));
  return progress.features[0].scenarios[0].bdd;
}

describe("oid progress scenario pass needs the evidence of a green", () => {
  it("is refused when no verification ran, naming the green to run, and leaves the status as it was", async () => {
    startProject();
    const result = await run(PASS);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("oid verify green <feature>:<line>");
    expect(recordedStatus()).toBe("fail");
  });

  it("is refused when a verified file was edited after the green", async () => {
    startProject();
    write("src/a.ts", "export const a = 2;\n");
    recordCheckpoint(dir, { ...GREEN, scenarios: [ALPHA] });
    write("src/a.ts", "export const a = 3;\n");
    const result = await run(PASS);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("src/a.ts");
    expect(recordedStatus()).toBe("fail");
  });

  it("is refused when the last checkpoint is a red that lists the scenario, or a green that lists another one", async () => {
    startProject();
    recordCheckpoint(dir, { ...RED, scenarios: [ALPHA] });
    expect((await run(PASS)).exitCode).toBe(1);
    recordCheckpoint(dir, { ...GREEN, scenarios: [{ feature: "FR-X-01", name: "Beta works" }] });
    expect((await run(PASS)).exitCode).toBe(1);
    expect(recordedStatus()).toBe("fail");
  });

  it("is accepted when the last green ran the scenario and nothing but the progress file changed since", async () => {
    startProject();
    recordCheckpoint(dir, { ...GREEN, scenarios: [ALPHA] });
    writeProgressFile({ ...PROGRESS, current_focus: null });
    const result = await run(PASS);
    expect(result.exitCode).toBe(0);
    expect(recordedStatus()).toBe("pass");
  });

  it("leaves fail and pending unchanged: they need no evidence", async () => {
    startProject();
    expect((await run(["progress", "scenario", "pending", "FR-X-01", "Alpha works"])).exitCode).toBe(0);
    expect((await run(["progress", "scenario", "fail", "FR-X-01", "Alpha works"])).exitCode).toBe(0);
  });
});
