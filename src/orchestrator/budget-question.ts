import { WAITING_INPUT } from "../events/types.js";
import { type Started, STATE, transition } from "./begin.js";
import type { ReviewInput } from "./services.js";

/** The answer that raises the limit that was reached. */
export const EXTEND = "extend";

/** The actions the person has when a limit of the budget is reached. */
const BUDGET_ACTIONS = [EXTEND, "abort"].map((key) => ({ key, label: key }));

/** The exit code of a process whose run a person aborted because the budget was exhausted. */
const BUDGET_EXIT_CODE = 4;

/** A limit of the budget that was reached: the state whose call it stopped and why. */
export type BudgetStop = { state: string; reason: string };

/** Puts the limit that was reached to the person. Without a terminal the question is saved and the exit code of the process is returned; aborting moves the run to ABORTED and returns the exit code of an exhausted budget. */
export async function askAboutBudget(bus: Started["bus"], input: ReviewInput, { state, reason }: BudgetStop): Promise<number | typeof EXTEND> {
  const prompt = `Budget exhausted at ${state}: ${reason}`;
  if (!input.isTTY) return bus.emit({ type: WAITING_INPUT, request: { id: "budget", prompt, actions: BUDGET_ACTIONS } }) ?? 1;
  if ((await input.choose(prompt, BUDGET_ACTIONS.map(({ key }) => key))) === EXTEND) return EXTEND;
  transition(bus, state, STATE.aborted, "the person chose to abort when the budget was exhausted");
  return BUDGET_EXIT_CODE;
}
