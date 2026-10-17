import { AGENT_START, ATTEMPT_REJECTED, type OIEventBody } from "../events/types.js";
import { isRejection, type Rejection, renderRejection } from "../artifacts/rejection.js";
import { attemptEffort, type Effort } from "./attempt-effort.js";
import type { Models } from "../artifacts/user-config.js";

export { isRejection, type Rejection };

/** The last rejection when the retries are used, and how many attempts there were. */
export type Exhausted = Rejection & { attempts: number };

/** What one attempt is told: which attempt it is, the effort it runs with, the note about the earlier attempt (empty for the first), and how to announce the attempt again when its session has to run again. */
export type AttemptInfo = { attempt: number; effort: Effort; note: string; announce: () => void };

/** How the attempts of one state run: who announces them, the state and role of the agent, the retries the project allows, the models it names, how the work of a failed attempt is thrown away, and the attempt itself. */
export type AttemptSpec<T> = {
  bus: { emit(event: OIEventBody): unknown };
  state: string;
  role: string;
  retries: number;
  models?: Models;
  restore: () => void;
  /** Set when the person asked for one more attempt after the retries ran out: its number and what the person said. */
  afterAsking?: { attempt: number; note: string };
  /** Set when the state was interrupted after a rejection: the attempt to start at and the reason the attempt before it was rejected. */
  from?: { attempt: number; reason: string };
  /** Called with the attempt and the reason when an attempt is rejected and another follows. */
  onRejected?: (attempt: number, reason: string) => void;
  /** Settles the budget before an attempt is announced; it rejects when the budget stops the run. */
  beforeCall?: () => Promise<void>;
  run: (info: AttemptInfo) => Promise<T | Rejection>;
};

/** Announces the start of an agent's attempt (the first, with no retries, by default) and returns the effort to run it with. */
export function announceAgent(bus: AttemptSpec<unknown>["bus"], { state, role, models, attempt = 1, retries = 0 }: { state: string; role: string; models?: Models; attempt?: number; retries?: number }): Effort {
  const effort = attemptEffort({ attempt, retries, models });
  bus.emit({ type: AGENT_START, state, role, attempt, model: effort.model, thinkingLevel: effort.thinkingLevel });
  return effort;
}

/** Tells an attempt why the one before it was rejected. */
function noteAbout(attempt: number, reason: string): string {
  return `This is attempt ${attempt}. It starts again from the last checkpoint: the files of the attempt before it were discarded, so write everything this task needs. That attempt was rejected because: ${reason}`;
}

/** Whether the result of the attempts is the last rejection after the retries ran out. */
export function isExhausted(result: unknown): result is Exhausted {
  return isRejection(result) && "attempts" in result;
}

/** Tells the one extra attempt what the person said. */
function noteFromPerson({ attempt, note }: { attempt: number; note: string }): string {
  return `This is attempt ${attempt}. The earlier attempts did not get through, and the person who follows the run says: ${note}`;
}

/** Runs the attempts of a state until one is accepted or the retries are used; with `afterAsking`, only the one extra attempt that the person asked for. */
export async function runAttempts<T>(spec: AttemptSpec<T>): Promise<T | Exhausted> {
  const extra = spec.afterAsking;
  const from = extra === undefined ? spec.from : undefined;
  let note = extra !== undefined ? noteFromPerson(extra) : from === undefined ? "" : noteAbout(from.attempt, from.reason);
  const lastRetry = extra === undefined ? spec.retries : extra.attempt - 1;
  for (let attempt = extra?.attempt ?? from?.attempt ?? 1; ; attempt += 1) {
    await spec.beforeCall?.();
    const effort = announceAgent(spec.bus, { ...spec, attempt, retries: lastRetry });
    const result = await spec.run({ attempt, effort, note, announce: () => void announceAgent(spec.bus, { ...spec, attempt, retries: lastRetry }) });
    if (!isRejection(result)) return result;
    const reason = renderRejection(result);
    spec.bus.emit({ type: ATTEMPT_REJECTED, state: spec.state, role: spec.role, attempt, reason });
    if (attempt > lastRetry) return { ...result, attempts: attempt };
    spec.onRejected?.(attempt, reason);
    spec.restore();
    note = noteAbout(attempt + 1, reason);
  }
}
