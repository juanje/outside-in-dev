import { describe, expect, it } from "vitest";
import { recordCheckpoint } from "../../src/artifacts/checkpoint.js";
import { readReturn, recordReturn } from "../../src/artifacts/return-record.js";
import { commitAll } from "./git-fixture.js";
import { runInProject } from "./run-capture.js";
import { dir, useTempDir, write, writeProgressFile } from "./temp-project.js";

useTempDir();

const FEATURE = { id: "FR-X-01", title: "Alpha", status: "in_progress" };

function startAt(step: string): void {
  write("src/a.ts", "export const a = 1;\n");
  commitAll();
  writeProgressFile({ current_focus: "FR-X-01", features: [{ ...FEATURE, cycle_step: step }] });
}

describe("oid progress step to bdd_red", () => {
  it("records a return from tdd_green: the step it came from and the tree", async () => {
    startAt("tdd_green");
    expect((await runInProject(["progress", "step", "FR-X-01", "bdd_red"])).exitCode).toBe(0);
    expect(readReturn(dir, "FR-X-01")?.from).toBe("tdd_green");
  });

  it("forgets the return once the feature leaves bdd_red", async () => {
    startAt("tdd_green");
    await runInProject(["progress", "step", "FR-X-01", "bdd_red"]);
    expect((await runInProject(["progress", "step", "FR-X-01", "tdd_red"])).exitCode).toBe(0);
    expect(readReturn(dir, "FR-X-01")).toBeUndefined();
  });

  it("records a return from tdd_red", async () => {
    startAt("tdd_red");
    await runInProject(["progress", "step", "FR-X-01", "bdd_red"]);
    expect(readReturn(dir, "FR-X-01")?.from).toBe("tdd_red");
  });

  it("records a return from quality_gate", async () => {
    startAt("quality_gate");
    await runInProject(["progress", "step", "FR-X-01", "bdd_red"]);
    expect(readReturn(dir, "FR-X-01")?.from).toBe("quality_gate");
  });

  it("keeps the return when the same move back is refused", async () => {
    startAt("refactor");
    await runInProject(["progress", "step", "FR-X-01", "bdd_red"]);
    expect((await runInProject(["progress", "step", "FR-X-01", "bdd_red"])).exitCode).toBe(1);
    expect(readReturn(dir, "FR-X-01")?.from).toBe("refactor");
  });

  it("forgets the return when the feature is marked done", async () => {
    startAt("refactor");
    writeProgressFile({ current_focus: "FR-X-01", features: [{ ...FEATURE, cycle_step: "bdd_red", scenarios: [{ name: "S", bdd: "pass" }] }] });
    recordReturn(dir, "FR-X-01", "refactor");
    recordCheckpoint(dir, { step: "tdd_green", feature: "FR-X-01", verify: { kind: "green", target: "all" }, external: false, date: new Date(), scenarios: [{ feature: "FR-X-01", name: "S" }] });
    expect((await runInProject(["progress", "done", "FR-X-01"])).exitCode).toBe(0);
    expect(readReturn(dir, "FR-X-01")).toBeUndefined();
  });
});
