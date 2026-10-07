import { describe, expect, it } from "vitest";
import { newRunId } from "../../src/orchestrator/run-id.js";

describe("run id", () => {
  it("is the start time, safe in a file name, followed by the given suffix", () => {
    expect(newRunId(new Date("2026-10-02T21:30:00.123Z"), "a1b2")).toBe("2026-10-02T21-30-00Z-a1b2");
  });
});
