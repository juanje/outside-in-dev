import { describe, expect, it } from "vitest";
import { plainLine } from "../../src/ui/plain.js";

describe("plainLine of a resumed run", () => {
  it("prints the state, the files discarded and the lock released", () => {
    const line = plainLine({ ts: 0, runId: "run-1", type: "resumed", state: "TDD_RED", discarded: ["tests/unit/a.test.ts", "src/b.ts"], releasedLock: 4242 });
    expect(line).toBe("resumed at TDD_RED | discarded tests/unit/a.test.ts, src/b.ts | released the lock of process 4242, which was not running");
  });

  it("says that nothing was discarded", () => {
    expect(plainLine({ ts: 0, runId: "run-1", type: "resumed", state: "FEATURE_REVIEW", discarded: [] })).toBe("resumed at FEATURE_REVIEW | nothing to discard");
  });
});
