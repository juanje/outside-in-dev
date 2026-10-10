import { AGENT_START, ATTEMPT_REJECTED, ERROR_EVENT, HUMAN_EDIT, RESUMED, WAITING_INPUT, type OIEvent } from "../events/types.js";

/** What separates the items of a list in a line of text. */
export const LIST_SEPARATOR = ", ";
const PART_SEPARATOR = " | ";

const oneLine = (text: string): string => text.replace(/\r?\n/g, PART_SEPARATOR);

/** How many characters of a reason a line shows. */
const REASON_LIMIT = 300;

/** The first `REASON_LIMIT` characters of a text, and a mark when it is longer. */
const bounded = (text: string): string => (text.length > REASON_LIMIT ? `${text.slice(0, REASON_LIMIT)}…` : text);

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
    case ATTEMPT_REJECTED:
      return `[${event.state}] attempt ${event.attempt} rejected: ${bounded(oneLine(event.reason))}`;
    case HUMAN_EDIT:
      return `human edit: ${event.file}`;
    case RESUMED:
      return resumedLine(event);
    case "state_change":
      return `[${event.from} -> ${event.to}] ${event.fr === undefined ? "" : `${event.fr}: `}${oneLine(event.reason)}`;
  }
}
