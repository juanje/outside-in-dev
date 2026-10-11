import { type Started, STATE } from "./begin.js";
import { askWhatNext } from "./retries-exhausted.js";
import type { ReviewInput } from "./services.js";

/** A scenario that is still red after the last iteration the project allows: whose it is and how many iterations it took. */
export type StuckScenario = { label: string; iterations: number };

/** Puts the stuck scenario to the person: returns the exit code the process ends with, or the note of the person who has one more iteration run; the other actions throw a `Redirect`. */
export async function stuckLoop(bus: Started["bus"], input: ReviewInput, { label, iterations }: StuckScenario): Promise<number | { note: string }> {
  const prompt = `${label} is still red after ${iterations} iterations of the inner loop`;
  return askWhatNext(bus, input, { id: "stuck-loop", prompt, state: STATE.bddCheck, label, reason: prompt });
}
