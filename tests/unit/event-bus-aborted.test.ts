import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEventBus } from "../../src/events/bus.js";

describe("event bus, aborted runs", () => {
  let cwd = "";
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "oid-bus-"));
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it("asks for exit code 2 when the run moves to ABORTED, and for none on any other move", () => {
    const bus = createEventBus({ cwd, runId: "run-1", write: () => undefined, now: () => 42 });
    const other = bus.emit({ type: "state_change", from: "BDD_CHECK", to: "TDD_RED", reason: "the scenario is still red" });
    const aborted = bus.emit({ type: "state_change", from: "BDD_CHECK", to: "ABORTED", reason: "the person chose abort" });
    expect([other, aborted]).toEqual([undefined, 2]);
  });
});
