import { describe, expect, it } from "vitest";
import { parseReport } from "../../src/agents/tools/report.js";

describe("parseReport", () => {
  it("accepts the three shapes of a report and refuses everything else", () => {
    expect(parseReport({ status: "done", files: ["src/a.ts"], summary: "Added a.", test: "tests/unit/a.test.ts > a > works" })).toEqual({ status: "done", files: ["src/a.ts"], summary: "Added a.", test: "tests/unit/a.test.ts > a > works" });
    expect(parseReport({ status: "done", files: [], summary: "Nothing left.", reason: "no_unit_logic_left" })).toMatchObject({ status: "done", files: [] });
    expect(parseReport({ status: "blocked", reason: "spec_conflict", detail: "A and B disagree." })).toEqual({ status: "blocked", reason: "spec_conflict", detail: "A and B disagree." });
    expect(parseReport({ status: "blocked", reason: "spec_conflict" })).toBeUndefined();
    expect(parseReport({ status: "blocked", reason: "unknown", detail: "x" })).toBeUndefined();
    expect(parseReport({ status: "done", files: ["src/a.ts"] })).toBeUndefined();
    expect(parseReport({ status: "done", files: ["src/a.ts"], summary: "x", reason: "no_unit_logic_left" })).toBeUndefined();
    expect(parseReport("done")).toBeUndefined();
  });
});

describe("reportTool", () => {
  it("is a Pi tool named report that accepts a valid report and rejects an invalid one", async () => {
    const { reportTool } = await import("../../src/agents/tools/report.js");
    expect(reportTool.name).toBe("report");
    expect(reportTool.parameters.type).toBe("object");
    const accepted = await reportTool.execute("call-1", { status: "blocked", reason: "other", detail: "Stuck." }, undefined, undefined, {} as never);
    expect(accepted.content[0]).toMatchObject({ type: "text" });
    await expect(reportTool.execute("call-2", { status: "blocked", reason: "other" }, undefined, undefined, {} as never)).rejects.toThrow(/report/);
  });
});
