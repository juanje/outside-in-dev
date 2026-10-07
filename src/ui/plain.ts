import type { OIEvent } from "../events/types.js";

const ERROR_EVENT = "error";
const LIST_SEPARATOR = ", ";
const PART_SEPARATOR = " | ";

/** One line of plain text for an event, for output that is not a terminal. */
export function plainLine(event: OIEvent): string {
  switch (event.type) {
    case ERROR_EVENT:
      return `error: ${[event.message, event.detail].filter((part) => part !== undefined).join(PART_SEPARATOR).replace(/\r?\n/g, PART_SEPARATOR)}`;
    case "waiting_input":
      return `waiting for input: ${event.request.prompt} [${event.request.actions.map((action) => action.key).join(LIST_SEPARATOR)}]`;
    case "state_change":
      return `[${event.from} -> ${event.to}] ${event.fr}: ${event.reason}`;
  }
}
