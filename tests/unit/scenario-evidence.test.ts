import { describe, expect, it } from "vitest";
import { firstFeature, progressOf, recordVerification, run, startProject } from "./evidence-fixture.js";
import { useTempDir, write, writeProgressFile } from "./temp-project.js";

useTempDir();

const PROGRESS = progressOf("bdd_red", [{ name: "Alpha works", bdd: "fail" }]);
const ALPHA = { feature: "FR-X-01", name: "Alpha works" };
const PASS = ["progress", "scenario", "pass", "FR-X-01", "Alpha works"];

function recordedStatus(): string {
  return firstFeature().scenarios[0].bdd;
}

describe("oid progress scenario pass needs the evidence of a green", () => {
  it("is refused when no verification ran, naming the green to run, and leaves the status as it was", async () => {
    startProject(PROGRESS);
    const result = await run(PASS);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("oid verify green <feature>:<line>");
    expect(recordedStatus()).toBe("fail");
  });

  it("is refused when a verified file was edited after the green", async () => {
    startProject(PROGRESS);
    write("src/a.ts", "export const a = 2;\n");
    recordVerification("green", [ALPHA]);
    write("src/a.ts", "export const a = 3;\n");
    const result = await run(PASS);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("src/a.ts");
    expect(recordedStatus()).toBe("fail");
  });

  it("is refused when the last checkpoint is a red that lists the scenario, or a green that lists another one", async () => {
    startProject(PROGRESS);
    recordVerification("red", [ALPHA]);
    expect((await run(PASS)).exitCode).toBe(1);
    recordVerification("green", [{ feature: "FR-X-01", name: "Beta works" }]);
    expect((await run(PASS)).exitCode).toBe(1);
    expect(recordedStatus()).toBe("fail");
  });

  it("is accepted when the last green ran the scenario and nothing but the progress file changed since", async () => {
    startProject(PROGRESS);
    recordVerification("green", [ALPHA]);
    writeProgressFile({ ...PROGRESS, current_focus: null });
    const result = await run(PASS);
    expect(result.exitCode).toBe(0);
    expect(recordedStatus()).toBe("pass");
  });

  it("leaves fail and pending unchanged: they need no evidence", async () => {
    startProject(PROGRESS);
    expect((await run(["progress", "scenario", "pending", "FR-X-01", "Alpha works"])).exitCode).toBe(0);
    expect((await run(["progress", "scenario", "fail", "FR-X-01", "Alpha works"])).exitCode).toBe(0);
  });
});
