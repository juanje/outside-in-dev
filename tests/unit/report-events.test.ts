import { describe, expect, it } from "vitest";
import { collectReport } from "../../src/agents/report-events.js";

const start = (id: string, args: unknown, tool = "report") => ({ type: "tool_execution_start", toolCallId: id, toolName: tool, args });
const end = (id: string, isError = false, tool = "report") => ({ type: "tool_execution_end", toolCallId: id, toolName: tool, result: {}, isError });
const blocked = (detail: string) => ({ status: "blocked", reason: "other", detail });

describe("collectReport", () => {
  it("returns the arguments of the last report call that succeeded, paired with its start by call id", () => {
    expect(collectReport([])).toBeUndefined();
    expect(collectReport([start("a", blocked("first")), end("a")])).toEqual(blocked("first"));
    expect(collectReport([start("a", blocked("first")), end("a"), start("b", blocked("second")), end("b")])).toEqual(blocked("second"));
    expect(collectReport([start("a", blocked("first")), end("a"), start("b", blocked("second")), end("b", true)])).toEqual(blocked("first"));
    expect(collectReport([start("a", blocked("x"), "read"), end("a", false, "read")])).toBeUndefined();
    expect(collectReport([start("a", { status: "done" }), end("a")])).toBeUndefined();
    expect(collectReport([start("a", blocked("never ended"))])).toBeUndefined();
  });
});
