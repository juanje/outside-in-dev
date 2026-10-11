import { describe, expect, it } from "vitest";
import { attemptsUsedBy, clearAttemptsUsed, readSession, recordAttemptsUsed } from "../../src/orchestrator/session.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

const used = { state: "TDD_RED", label: "Add a line", used: 1, reason: "the report names no unit test" };

describe("the attempts a state used, in the saved session", () => {
  it("are recorded for the state and the label, and found only for those", () => {
    write(".outside-in/session.json", JSON.stringify({ runId: "run-1", state: "TDD_RED" }));
    recordAttemptsUsed(dir, used);
    expect({ same: attemptsUsedBy(dir, "TDD_RED", "Add a line"), otherState: attemptsUsedBy(dir, "CODE_GREEN", "Add a line"), otherLabel: attemptsUsedBy(dir, "TDD_RED", "Remove a line") }).toEqual({ same: used, otherState: undefined, otherLabel: undefined });
    expect(readSession(dir)).toEqual({ runId: "run-1", state: "TDD_RED", attemptsUsed: used });
  });

  it("are gone once cleared, and a session saved before the field has none", () => {
    write(".outside-in/session.json", JSON.stringify({ runId: "run-1", state: "TDD_RED" }));
    expect(attemptsUsedBy(dir, "TDD_RED", "Add a line")).toBeUndefined();
    recordAttemptsUsed(dir, used);
    clearAttemptsUsed(dir);
    expect(readSession(dir)).toEqual({ runId: "run-1", state: "TDD_RED" });
  });
});
