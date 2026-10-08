import { ERROR_EVENT, WAITING_INPUT } from "../events/types.js";
import { type Started, STATE, transition } from "./begin.js";
import type { ReviewInput } from "./services.js";

const ABORT = "abort";
const ACTIONS = ["retry", "rewrite", "skip_scenario", "skip_fr", ABORT].map((key) => ({ key, label: key }));

/** A scenario that is still red after the last iteration the project allows: whose it is and how many iterations it took. */
export type StuckScenario = { label: string; iterations: number };

/** Puts the stuck scenario to the person: returns the exit code the process ends with. Only aborting is possible until retries exist: it moves the run to ABORTED; any other answer ends the run with an error. */
export async function stuckLoop(bus: Started["bus"], input: ReviewInput, { label, iterations }: StuckScenario): Promise<number> {
  const prompt = `${label} is still red after ${iterations} iterations of the inner loop`;
  if (!input.isTTY) return bus.emit({ type: WAITING_INPUT, request: { id: "stuck-loop", prompt, actions: ACTIONS } }) ?? 1;
  const answer = await input.choose(prompt, ACTIONS.map(({ key }) => key));
  if (answer !== ABORT) return bus.emit({ type: ERROR_EVENT, message: `${label}: "${answer}" has to wait for retries (FR-RUN-08): only ${ABORT} is possible now` }) ?? 1;
  return transition(bus, STATE.bddCheck, STATE.aborted, `${label}: the person chose to ${ABORT}`) ?? 1;
}
