/** The type of the event that reports a failure. */
export const ERROR_EVENT = "error";

/** The type of the event that waits for an answer. */
export const WAITING_INPUT = "waiting_input";

/** The type of the event that reports a file a person edited. */
export const HUMAN_EDIT = "human_edit";

/** The type of the event that reports a move from one state to another. */
export const STATE_CHANGE = "state_change";

/** The state a run moves to when a person aborts it. */
export const ABORTED = "ABORTED";

/** The type of the event that reports an agent about to start an attempt. */
export const AGENT_START = "agent_start";

/** The type of the event that reports an attempt the gate of its state rejected, with the reason. */
export const ATTEMPT_REJECTED = "attempt_rejected";

/** The type of the event that reports a run resumed by `oid resume`. */
export const RESUMED = "resumed";

/** A question that needs a person's answer, with the actions the person can choose. */
export type InputRequest = {
  id: string;
  prompt: string;
  actions: { key: string; label: string }[];
};

/** What happens in a run, before it is stamped with a time and a run id. */
export type OIEventBody =
  | { type: "state_change"; from: string; to: string; reason: string; fr?: string }
  | { type: typeof ERROR_EVENT; message: string; detail?: string }
  | { type: typeof WAITING_INPUT; request: InputRequest }
  | { type: typeof HUMAN_EDIT; file: string }
  | { type: typeof AGENT_START; state: string; role: string; attempt: number; model?: string; thinkingLevel: string }
  | { type: typeof ATTEMPT_REJECTED; state: string; role: string; attempt: number; reason: string }
  | { type: typeof RESUMED; state: string; discarded: string[]; releasedLock?: number };

/** An event as it is logged and shown: the body plus when and in which run it happened. */
export type OIEvent = { ts: number; runId: string } & OIEventBody;
