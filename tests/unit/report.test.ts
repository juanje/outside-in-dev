import { describe, expect, it } from "vitest";
import type { CycleState } from "../../src/agents/profiles.js";
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

  it("accepts a blocked report that says a unit test or a step definition is wrong, and offers both reasons to the agent", async () => {
    const { reportTool } = await import("../../src/agents/tools/report.js");
    for (const reason of ["wrong_test", "wrong_step"]) {
      expect(parseReport({ status: "blocked", reason, detail: "It can never pass." })).toEqual({ status: "blocked", reason, detail: "It can never pass." });
      expect(JSON.stringify(reportTool.parameters)).toContain(reason);
      expect(reportTool.description).toContain(reason);
    }
  });
});

/** The message of the error the report tool throws for a report, empty when it accepts it. */
async function refusal(args: Record<string, unknown>, state?: CycleState): Promise<string> {
  const { reportToolFor } = await import("../../src/agents/tools/report.js");
  try {
    await reportToolFor(state).execute("call-1", args as never, undefined, undefined, {} as never);
  } catch (error) {
    return (error as Error).message;
  }
  return "";
}

describe("the refusal of the report tool", () => {
  it("names the field that the form of a report with no unit logic left does not allow, and gives that form", async () => {
    const text = await refusal({ status: "done", files: [], summary: "No unit logic is left.", reason: "no_unit_logic_left", test: "no_unit_logic_left" });
    expect(text).toMatch(/^.+\nEvidence:\n {2}test: /);
    expect(text).toMatch(/\nNext: .*files.*summary.*reason: no_unit_logic_left/);
  });

  it("names the field that a blocked report leaves out, and gives the form of a blocked report", async () => {
    const text = await refusal({ status: "blocked", reason: "spec_gap" });
    expect(text).toMatch(/^.+\nEvidence:\n {2}detail: /);
    expect(text).toMatch(/\nNext: .*status: blocked.*reason.*detail/);
  });

  it("names every blocked reason in the form of a blocked report", async () => {
    const text = await refusal({ status: "blocked", reason: "spec_gap" });
    for (const reason of ["spec_conflict", "spec_gap", "cannot_test", "wrong_test", "wrong_step", "other"]) {
      expect(text.split("\nNext: ")[1]).toContain(reason);
    }
  });

  it("refuses in the test-writing step a test that is not of the form test file and test name, and takes it in the other steps", async () => {
    const report = { status: "done", files: ["tests/unit/cart.test.ts"], summary: "Added a test.", test: "adds a line" };
    const text = await refusal(report, "TDD_RED");
    expect(text).toMatch(/^.+\nEvidence:\n {2}test: .*adds a line/);
    expect(text).toMatch(/\nNext: .*<test file> > <test name>/);
    expect(await refusal({ ...report, test: "tests/unit/cart.test.ts > cart > adds a line" }, "TDD_RED")).toBe("");
    expect(await refusal(report, "CODE_GREEN")).toBe("");
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
