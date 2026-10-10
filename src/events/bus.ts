import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ProgressError } from "../artifacts/progress.js";
import { runDirectory, savePendingInput } from "../orchestrator/session.js";
import { plainLine } from "../ui/plain.js";
import { ABORTED, ERROR_EVENT, STATE_CHANGE, WAITING_INPUT, type OIEvent, type OIEventBody } from "./types.js";

/** The exit code of a process that waits for an answer and has no channel to receive it. */
const WAITING_INPUT_EXIT_CODE = 3;

/** The exit code of a process that cannot save the question it waits on. */
const FAILURE_EXIT_CODE = 1;

/** The exit code of a process whose run a person aborted. */
const ABORTED_EXIT_CODE = 2;

export type EventBusOptions = {
  cwd: string;
  runId: string;
  write: (text: string) => void;
  /** The clock the events are stamped with, read when each one is emitted; by default the system clock. */
  now?: () => number;
  /** Whether someone asked the run to stop (`oid abort`); by default nobody does. */
  stopRequested?: () => boolean;
};

/** Publishes the events of one run: each is logged, then printed as one plain line. */
export function createEventBus(options: EventBusOptions) {
  const runDir = runDirectory(options.cwd, options.runId);
  const bus = {
    /** Whether someone asked the run to stop after the step it is in. */
    stopRequested: (): boolean => options.stopRequested?.() ?? false,
    /** Logs and prints the event; returns the exit code the process must end with, if the event ends it. */
    emit(body: OIEventBody): number | undefined {
      const event: OIEvent = { ts: (options.now ?? Date.now)(), runId: options.runId, ...body };
      mkdirSync(runDir, { recursive: true });
      appendFileSync(join(runDir, "events.jsonl"), `${JSON.stringify(event)}\n`);
      options.write(`${plainLine(event)}\n`);
      if (event.type === STATE_CHANGE && event.to === ABORTED) return ABORTED_EXIT_CODE;
      if (event.type !== WAITING_INPUT) return undefined;
      try {
        savePendingInput(options.cwd, options.runId, event.request);
      } catch (error) {
        if (!(error instanceof ProgressError)) throw error;
        bus.emit({ type: ERROR_EVENT, message: error.message });
        return FAILURE_EXIT_CODE;
      }
      return WAITING_INPUT_EXIT_CODE;
    },
  };
  return bus;
}
