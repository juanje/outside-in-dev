const ASSISTANT = "assistant";
const MESSAGE_END = "message_end";
export const PROVIDER_ERROR = "error";
export const ABORTED = "aborted";
export const EMPTY = "empty";

type MessageEvent = { type?: string; message?: { role?: string; stopReason?: string; errorMessage?: string; content?: unknown[] } };

/** How a prompt ended: with a provider error (and whether retrying could help). */
export type ResponseVerdict = { kind: typeof PROVIDER_ERROR; transient: boolean; message: string } | { kind: typeof EMPTY } | { kind: "productive" } | { kind: typeof ABORTED };

const TRANSIENT = /rate.?limit|too many requests|overloaded|\b(429|5\d\d)\b|econnreset|etimedout|fetch failed|socket hang up/i;

/** Errors that retrying cannot fix and would only cost money: authentication, quota or billing, an unknown model. They win over a transient-looking status such as a 429. */
const STOP_AND_ASK = /\b(401|402|403|404)\b|api.?key|unauthori[sz]ed|authentication|forbidden|quota|billing|credits|model.*not found/i;

/** Decides from the events of a prompt whether the agent's turn worked. */
export function checkResponse(events: readonly unknown[]): ResponseVerdict {
  const ends = (events as MessageEvent[]).filter((event) => event.type === MESSAGE_END && event.message?.role === ASSISTANT);
  const failed = ends.find((event) => event.message?.stopReason === PROVIDER_ERROR);
  if (failed === undefined && ends.some((event) => event.message?.stopReason === ABORTED)) return { kind: ABORTED };
  if (failed === undefined) return ends.some((event) => (event.message?.content?.length ?? 0) > 0) ? { kind: "productive" } : { kind: EMPTY };
  const message = failed.message?.errorMessage ?? "";
  return { kind: PROVIDER_ERROR, transient: !STOP_AND_ASK.test(message) && TRANSIENT.test(message), message };
}
