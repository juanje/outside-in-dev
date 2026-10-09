import { AGENT_START, type OIEventBody } from "../events/types.js";
import { isObject } from "../artifacts/progress.js";
import { attemptEffort, type Effort } from "./attempt-effort.js";
import type { ProjectConfig } from "../artifacts/project-config.js";

/** An attempt that the gate of its state rejected, with the reason. */
export type Rejection = { rejected: string };

/** The last rejection when the retries are used, and how many attempts there were. */
export type Exhausted = Rejection & { attempts: number };

/** What one attempt is told: which attempt it is, the effort it runs with and the note about the earlier attempt (empty for the first). */
export type AttemptInfo = { attempt: number; effort: Effort; note: string };

/** How the attempts of one state run: who announces them, the state and role of the agent, the retries the project allows, the models it names, how the work of a failed attempt is thrown away, and the attempt itself. */
export type AttemptSpec<T> = {
  bus: { emit(event: OIEventBody): unknown };
  state: string;
  role: string;
  retries: number;
  models?: ProjectConfig["models"];
  restore: () => void;
  /** Set when the person asked for one more attempt after the retries ran out: its number and what the person said. */
  afterAsking?: { attempt: number; note: string };
  run: (info: AttemptInfo) => Promise<T | Rejection>;
};

/** Announces the start of an agent's attempt (the first, with no retries, by default) and returns the effort to run it with. */
export function announceAgent(bus: AttemptSpec<unknown>["bus"], { state, role, models, attempt = 1, retries = 0 }: { state: string; role: string; models?: ProjectConfig["models"]; attempt?: number; retries?: number }): Effort {
  const effort = attemptEffort({ attempt, retries, models });
  bus.emit({ type: AGENT_START, state, role, attempt, model: effort.model, thinkingLevel: effort.thinkingLevel });
  return effort;
}

/** Tells an attempt why the one before it was rejected. */
function noteAbout(attempt: number, reason: string): string {
  return `This is attempt ${attempt}. The attempt before it was rejected: ${reason}`;
}

/** Whether the result of an attempt is a rejection. */
export function isRejection(result: unknown): result is Rejection {
  return isObject(result) && "rejected" in result;
}

/** Whether the result of the attempts is the last rejection after the retries ran out. */
export function isExhausted(result: unknown): result is Exhausted {
  return isRejection(result) && "attempts" in result;
}

/** Tells the one extra attempt what the person said. */
function noteFromPerson({ attempt, note }: { attempt: number; note: string }): string {
  return `This is attempt ${attempt}. The earlier attempts were rejected, and the person who follows the run says: ${note}`;
}

/** Runs the attempts of a state until one is accepted or the retries are used; with `afterAsking`, only the one extra attempt that the person asked for. */
export async function runAttempts<T>(spec: AttemptSpec<T>): Promise<T | Exhausted> {
  const extra = spec.afterAsking;
  let note = extra === undefined ? "" : noteFromPerson(extra);
  const lastRetry = extra === undefined ? spec.retries : extra.attempt - 1;
  for (let attempt = extra?.attempt ?? 1; ; attempt += 1) {
    const effort = announceAgent(spec.bus, { ...spec, attempt });
    const result = await spec.run({ attempt, effort, note });
    if (!isRejection(result)) return result;
    if (attempt > lastRetry) return { ...result, attempts: attempt };
    spec.restore();
    note = noteAbout(attempt + 1, result.rejected);
  }
}
