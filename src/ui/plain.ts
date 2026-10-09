import { AGENT_START, ERROR_EVENT, HUMAN_EDIT, RESUMED, WAITING_INPUT, type OIEvent } from "../events/types.js";

/** What separates the items of a list in a line of text. */
export const LIST_SEPARATOR = ", ";
const PART_SEPARATOR = " | ";

const oneLine = (text: string): string => text.replace(/\r?\n/g, PART_SEPARATOR);

/** The line of a resumed run: the state, what was discarded and the lock that was released. */
function resumedLine(event: Extract<OIEvent, { type: typeof RESUMED }>): string {
  return [
    `resumed at ${event.state}`,
    event.discarded.length === 0 ? "nothing to discard" : `discarded ${event.discarded.join(LIST_SEPARATOR)}`,
    ...(event.releasedLock === undefined ? [] : [`released the lock of process ${event.releasedLock}, which was not running`]),
  ].join(PART_SEPARATOR);
}

/** One line of plain text for an event, for output that is not a terminal. */
export function plainLine(event: OIEvent): string {
  switch (event.type) {
    case ERROR_EVENT:
      return `error: ${oneLine([event.message, event.detail].filter((part) => part !== undefined).join(PART_SEPARATOR))}`;
    case WAITING_INPUT:
      return `waiting for input: ${oneLine(event.request.prompt)} [${event.request.actions.map((action) => action.key).join(LIST_SEPARATOR)}]`;
    case AGENT_START:
      return `[${event.state}] ${event.role} attempt ${event.attempt} (${event.model === undefined ? "" : `model ${event.model}, `}thinking ${event.thinkingLevel})`;
    case HUMAN_EDIT:
      return `human edit: ${event.file}`;
    case RESUMED:
      return resumedLine(event);
    case "state_change":
      return `[${event.from} -> ${event.to}] ${event.fr === undefined ? "" : `${event.fr}: `}${oneLine(event.reason)}`;
  }
}
