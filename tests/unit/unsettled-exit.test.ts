import { describe, expect, it } from "vitest";
import { watchUnsettled } from "../../src/unsettled-exit.js";

/** A process that records the 'exit' listener and what is written to its standard error, and fires the listener when the test says the event loop emptied. */
function fakeProcess() {
  const listeners: Array<() => void> = [];
  const written: string[] = [];
  return {
    process: { once: (_event: "exit", listener: () => void) => void listeners.push(listener), stderr: { write: (text: string) => void written.push(text) } },
    exit: () => listeners.forEach((listener) => listener()),
    written,
  };
}

describe("watchUnsettled", () => {
  it("says on the standard error, when the process ends before the command did, which command it was and that the run can be resumed", () => {
    const { process, exit, written } = fakeProcess();
    watchUnsettled(process, "run --fr FR-CART-02");
    exit();
    expect(written.join("")).toBe('oid: the process ended while "oid run --fr FR-CART-02" had not finished (nothing was left to wait for). A run is as its last checkpoint left it, and "oid resume" continues it (it releases the lock of a process that is gone).\n');
  });

  it("says nothing when the command finished", () => {
    const { process, exit, written } = fakeProcess();
    watchUnsettled(process, "status").settled();
    exit();
    expect(written).toEqual([]);
  });
});
