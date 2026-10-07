import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { OUTSIDE_IN_DIR, savePendingInput } from "../orchestrator/session.js";
import { plainLine } from "../ui/plain.js";
import type { OIEvent, OIEventBody } from "./types.js";

/** The exit code of a process that waits for an answer and has no channel to receive it. */
const WAITING_INPUT_EXIT_CODE = 3;

export type EventBusOptions = {
  cwd: string;
  runId: string;
  write: (text: string) => void;
  now: () => number;
};

/** Publishes the events of one run: each is logged, then printed as one plain line. */
export function createEventBus(options: EventBusOptions) {
  const runDir = join(options.cwd, OUTSIDE_IN_DIR, "runs", options.runId);
  return {
    /** Logs and prints the event; returns the exit code the process must end with, if the event ends it. */
    emit(body: OIEventBody): number | undefined {
      const event: OIEvent = { ts: options.now(), runId: options.runId, ...body };
      mkdirSync(runDir, { recursive: true });
      appendFileSync(join(runDir, "events.jsonl"), `${JSON.stringify(event)}\n`);
      options.write(`${plainLine(event)}\n`);
      if (event.type !== "waiting_input") return undefined;
      savePendingInput(options.cwd, options.runId, event.request);
      return WAITING_INPUT_EXIT_CODE;
    },
  };
}
