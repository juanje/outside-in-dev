import { describe, expect, it } from "vitest";
import { firstFeature, progressOf, recordVerification, run, startProject } from "./evidence-fixture.js";
import { useTempDir, write, writeProgressFile } from "./temp-project.js";

useTempDir();

const PROGRESS = progressOf("quality_gate", [
  { name: "Alpha works", bdd: "pass" },
  { name: "Beta works", bdd: "pass" },
]);
const ALPHA = { feature: "FR-X-01", name: "Alpha works" };
const BETA = { feature: "FR-X-01", name: "Beta works" };
const DONE = ["progress", "done", "FR-X-01"];

function recordedStatus(): string {
  return firstFeature().status;
}

describe("oid progress done needs current evidence for every scenario", () => {
  it("is refused when no green was recorded, naming the green to run, and writes nothing", async () => {
    startProject(PROGRESS);
    const result = await run(DONE);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Alpha works");
    expect(result.stderr).toContain("Beta works");
    expect(result.stderr).toContain("oid verify green");
    expect(recordedStatus()).toBe("in_progress");
  });

  it("is refused when a verified file changed after the green", async () => {
    startProject(PROGRESS);
    recordVerification("green", [ALPHA, BETA]);
    write("src/a.ts", "export const a = 3;\n");
    const result = await run(DONE);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("src/a.ts");
    expect(result.stderr).toContain("oid verify green");
    expect(recordedStatus()).toBe("in_progress");
  });

  it("is refused when the last green does not list one of the scenarios in pass, naming it", async () => {
    startProject(PROGRESS);
    recordVerification("green", [ALPHA]);
    const result = await run(DONE);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Beta works");
    expect(result.stderr).not.toContain("Alpha works");
    expect(recordedStatus()).toBe("in_progress");
  });

  it("is accepted when the last green lists every scenario and only the progress file changed since", async () => {
    startProject(PROGRESS);
    recordVerification("green", [ALPHA, BETA]);
    writeProgressFile({ ...PROGRESS, current_focus: null });
    const result = await run(DONE);
    expect(result.exitCode).toBe(0);
    expect(recordedStatus()).toBe("done");
  });
});
