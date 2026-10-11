import { appendFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { IGNORE } from "../artifacts/command-supervisor.js";
import { FEATURE_STATUS, ProgressError } from "../artifacts/progress.js";
import { runDirectory, savePendingInput } from "../orchestrator/session.js";
import { plainLine } from "../ui/plain.js";
import { ABORTED, DONE, ERROR_EVENT, STATE_CHANGE, WAITING_INPUT, type OIEvent, type OIEventBody } from "./types.js";

/** The exit code of a process that waits for an answer and has no channel to receive it. */
const WAITING_INPUT_EXIT_CODE = 3;

/** The exit code of a process that cannot save the question it waits on. */
const FAILURE_EXIT_CODE = 1;

/** The exit code of a process whose run a person aborted. */
const ABORTED_EXIT_CODE = 2;

/** The exit code reported when a notification command cannot be run. */
const COMMAND_NOT_FOUND_EXIT_CODE = 127;

export type EventBusOptions = {
  cwd: string;
  runId: string;
  write: (text: string) => void;
  /** The clock the events are stamped with, read when each one is emitted; by default the system clock. */
  now?: () => number;
  /** Whether someone asked the run to stop (`oid abort`); by default nobody does. */
  stopRequested?: () => boolean;
  /** A command to invoke when the run needs the person's attention. */
  notifyCommand?: string;
  /** Receives a notification when the run needs the person's attention. */
  onNotify?: (event: unknown) => void;
};

function notificationFor(event: OIEvent): { event: string; message: string } | undefined {
  switch (event.type) {
    case WAITING_INPUT:
      return { event: event.type, message: event.request.prompt };
    case ERROR_EVENT:
      return { event: event.type, message: `${event.message} (run finished: failed)` };
    case STATE_CHANGE:
      if (event.to !== DONE) return undefined;
      return {
        event: FEATURE_STATUS.done,
        message: event.fr !== undefined && !event.reason.includes(event.fr) ? `${event.reason}: ${event.fr}` : event.reason,
      };
    default:
      return undefined;
  }
}

function notify(options: EventBusOptions, event: OIEvent): void {
  try {
    if (options.notifyCommand === undefined && options.onNotify === undefined) return;
    const notification = notificationFor(event);
    if (notification === undefined) return;
    options.onNotify?.(notification);
    if (options.notifyCommand !== undefined) {
      const result = spawnSync("sh", ["-c", options.notifyCommand], { cwd: options.cwd, env: { ...process.env, OID_EVENT: notification.event, OID_MESSAGE: notification.message }, stdio: IGNORE });
      if (result.status !== 0) options.write(`${result.status === COMMAND_NOT_FOUND_EXIT_CODE ? "notification command could not be run" : `notification command failed (exit code ${result.status})`}\n`);
    }
  } catch (error) {
    const problem = error instanceof Error ? error.message : String(error);
    options.write(`${notificationFor(event)?.event === FEATURE_STATUS.done ? "notification command could not be run" : `notification command failed: ${problem}`}\n`);
  }
}

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
      notify(options, event);
      if (event.type === ERROR_EVENT && (options.onNotify !== undefined || options.notifyCommand !== undefined)) return FAILURE_EXIT_CODE;
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
