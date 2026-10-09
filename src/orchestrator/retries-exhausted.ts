import { ERROR_EVENT, WAITING_INPUT } from "../events/types.js";
import { type Started, STATE, transition } from "./begin.js";
import type { ReviewInput } from "./services.js";

/** The answer that has the agent try again, and the one that aborts the run. */
const RETRY = "retry";
export const ABORT = "abort";

/** The actions the person has when a state cannot go on by itself. */
export const STUCK_ACTIONS = [RETRY, "rewrite", "skip_scenario", "skip_fr", ABORT].map((key) => ({ key, label: key }));

/** A state whose attempts all failed: the state, whose it is, how many attempts there were and why the last one was rejected. */
export type ExhaustedAttempts = { state: string; label: string; attempts: number; rejected: string };

/** Puts the state that ran out of retries to the person: returns the exit code the process ends with, or the note of the person who has the agent try once more. */
export async function askAfterAttempts(bus: Started["bus"], input: ReviewInput, { state, label, attempts, rejected }: ExhaustedAttempts): Promise<number | { note: string }> {
  const prompt = `${label} failed ${attempts} attempts of ${state}: ${rejected}`;
  if (!input.isTTY) return bus.emit({ type: WAITING_INPUT, request: { id: "retries-exhausted", prompt, actions: STUCK_ACTIONS } }) ?? 1;
  const answer = await input.choose(prompt, STUCK_ACTIONS.map(({ key }) => key));
  if (answer === RETRY) return { note: await input.line("What should the agent know for one more attempt?") };
  if (answer !== ABORT) return bus.emit({ type: ERROR_EVENT, message: `${label}: "${answer}" is not implemented yet: only ${RETRY} and ${ABORT} are possible now` }) ?? 1;
  return transition(bus, state, STATE.aborted, `${label}: the person chose to ${ABORT}`) ?? 1;
}
