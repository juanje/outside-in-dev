import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEventBus } from "../../src/events/bus.js";

describe("event bus", () => {
  let cwd = "";
  let printed = "";
  const bus = () => createEventBus({ cwd, runId: "run-1", write: (text) => (printed += text), now: () => 42 });

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "oid-bus-"));
    printed = "";
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it("appends each event to the run's log with its time and run, and prints its line", () => {
    const exitCode = bus().emit({ type: "error", message: "agent timed out" });
    bus().emit({ type: "error", message: "again" });
    const lines = readFileSync(join(cwd, ".outside-in/runs/run-1/events.jsonl"), "utf8").trimEnd().split("\n");
    expect(lines.map((line) => JSON.parse(line))).toEqual([
      { ts: 42, runId: "run-1", type: "error", message: "agent timed out" },
      { ts: 42, runId: "run-1", type: "error", message: "again" },
    ]);
    expect(printed).toBe("error: agent timed out\nerror: again\n");
    expect(exitCode).toBeUndefined();
  });

  it("stamps each event with the time it is emitted when it is given no clock", () => {
    const withoutClock = createEventBus({ cwd, runId: "run-1", write: () => undefined });
    const before = Date.now();
    withoutClock.emit({ type: "error", message: "first" });
    const after = Date.now();
    const [event] = readFileSync(join(cwd, ".outside-in/runs/run-1/events.jsonl"), "utf8").trimEnd().split("\n").map((line) => JSON.parse(line));
    expect(event.ts).toBeGreaterThanOrEqual(before);
    expect(event.ts).toBeLessThanOrEqual(after);
  });

  it("saves the session and asks for exit code 3 when a question has no terminal to answer it", () => {
    const request = { id: "request-1", prompt: "Accept the ambiguous Red?", actions: [{ key: "approve", label: "Approve" }] };
    const exitCode = bus().emit({ type: "waiting_input", request });
    expect(exitCode).toBe(3);
    expect(JSON.parse(readFileSync(join(cwd, ".outside-in/session.json"), "utf8"))).toEqual({ runId: "run-1", pendingInput: request });
  });

  it("notifies with done when the run reaches DONE", () => {
    const notified: unknown[] = [];
    const notifyingBus = createEventBus({ cwd, runId: "run-1", write: () => undefined, now: () => 42, onNotify: (event: unknown) => notified.push(event) } as Parameters<typeof createEventBus>[0] & { onNotify: (event: unknown) => void });

    notifyingBus.emit({ type: "state_change", from: "COMMIT", to: "DONE", reason: "finished FR-CART-02", fr: "FR-CART-02" });

    expect(notified).toEqual([{ event: "done", message: "finished FR-CART-02" }]);
  });

  it("notifies with error when the run emits an error", () => {
    const notified: unknown[] = [];
    const notifyingBus = createEventBus({ cwd, runId: "run-1", write: () => undefined, now: () => 42, onNotify: (event: unknown) => notified.push(event) } as Parameters<typeof createEventBus>[0] & { onNotify: (event: unknown) => void });

    const exitCode = notifyingBus.emit({ type: "error", message: "the report names no unit test" });

    expect(exitCode).toBe(1);
    expect(notified).toHaveLength(1);
    expect(notified[0]).toMatchObject({ event: "error", message: expect.stringContaining("the report names no unit test") });
  });

  it("includes the finished feature in a done notification even when the transition reason is generic", () => {
    const notified: unknown[] = [];
    const notifyingBus = createEventBus({ cwd, runId: "run-1", write: () => undefined, now: () => 42, onNotify: (event: unknown) => notified.push(event) } as Parameters<typeof createEventBus>[0] & { onNotify: (event: unknown) => void });

    notifyingBus.emit({ type: "state_change", from: "FR_COMMIT", to: "DONE", reason: "run finished", fr: "FR-CART-02" });

    expect(notified).toEqual([{ event: "done", message: "run finished: FR-CART-02" }]);
  });

  it("warns when a notification fails without stopping a waiting run", () => {
    const notifyingBus = createEventBus({
      cwd,
      runId: "run-1",
      write: (text) => (printed += text),
      now: () => 42,
      onNotify: () => {
        throw new Error("notification command exited with code 7");
      },
    } as Parameters<typeof createEventBus>[0] & { onNotify: (event: unknown) => void });
    const request = { id: "request-1", prompt: "Review the feature files?", actions: [{ key: "approve", label: "Approve" }] };

    let exitCode: number | undefined;
    expect(() => (exitCode = notifyingBus.emit({ type: "waiting_input", request }))).not.toThrow();

    expect(exitCode).toBe(3);
    expect(printed).toMatch(/notification command.*(?:fail|exit|code)/i);
  });

  it("warns when a notification command could not be run after the run finishes", () => {
    const notifyingBus = createEventBus({
      cwd,
      runId: "run-1",
      write: (text) => (printed += text),
      now: () => 42,
      onNotify: () => {
        throw new Error("notification command failed (exit code 127)");
      },
    } as Parameters<typeof createEventBus>[0] & { onNotify: (event: unknown) => void });

    expect(() => notifyingBus.emit({ type: "state_change", from: "FR_COMMIT", to: "DONE", reason: "finished FR-CART-02", fr: "FR-CART-02" })).not.toThrow();

    expect(printed).toMatch(/notification command.*could not be run/i);
  });

  it("reports an error that names the session file, and leaves the file alone, when the session is not valid JSON", () => {
    mkdirSync(join(cwd, ".outside-in"));
    writeFileSync(join(cwd, ".outside-in/session.json"), "{not json");
    const request = { id: "request-1", prompt: "Accept the ambiguous Red?", actions: [{ key: "approve", label: "Approve" }] };
    let exitCode: number | undefined;
    expect(() => (exitCode = bus().emit({ type: "waiting_input", request }))).not.toThrow();
    const [question, failure, ...rest] = printed.trimEnd().split("\n");
    expect(question).toBe("waiting for input: Accept the ambiguous Red? [approve]");
    expect(failure).toMatch(/^error: .*\.outside-in\/session\.json/);
    expect(rest).toEqual([]);
    expect(exitCode).toBe(1);
    expect(readFileSync(join(cwd, ".outside-in/session.json"), "utf8")).toBe("{not json");
    const logged = readFileSync(join(cwd, ".outside-in/runs/run-1/events.jsonl"), "utf8").trimEnd().split("\n");
    expect(logged.map((line) => JSON.parse(line).type)).toEqual(["waiting_input", "error"]);
  });
});
