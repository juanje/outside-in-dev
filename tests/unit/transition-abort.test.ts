import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEventBus } from "../../src/events/bus.js";
import { transition } from "../../src/orchestrator/begin.js";
import { RunStopped } from "../../src/orchestrator/run-stopped.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

const busAsked = (stop: boolean) => createEventBus({ cwd: dir, runId: "run-1", write: () => undefined, now: () => 42, stopRequested: () => stop });
const moves = () =>
  readFileSync(join(dir, ".outside-in/runs/run-1/events.jsonl"), "utf8")
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as { from: string; to: string })
    .map(({ from, to }) => `${from}->${to}`);

describe("a transition after an abort was requested", () => {
  it("makes the move, then moves the run to ABORTED from the state it entered and stops it with exit code 2", () => {
    const stopped = (() => {
      try {
        transition(busAsked(true), "TDD_RED", "CODE_GREEN", "the unit test fails validly");
      } catch (error) {
        return error;
      }
      return undefined;
    })();
    expect(stopped).toBeInstanceOf(RunStopped);
    expect((stopped as RunStopped).code).toBe(2);
    expect(moves()).toEqual(["TDD_RED->CODE_GREEN", "CODE_GREEN->ABORTED"]);
  });

  it("lets a run that ends go on: a move to DONE is not followed by ABORTED", () => {
    expect(transition(busAsked(true), "FR_COMMIT", "DONE", "every target feature is committed")).toBeUndefined();
    expect(moves()).toEqual(["FR_COMMIT->DONE"]);
  });

  it("does nothing more when no abort was requested", () => {
    expect(transition(busAsked(false), "TDD_RED", "CODE_GREEN", "the unit test fails validly")).toBeUndefined();
    expect(moves()).toEqual(["TDD_RED->CODE_GREEN"]);
  });
});
