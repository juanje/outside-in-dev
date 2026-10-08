import { ERROR_EVENT, WAITING_INPUT } from "../events/types.js";
import { NEWLINE } from "../artifacts/lines.js";
import { type Started, STATE, transition } from "./begin.js";
import type { ReviewInput } from "./services.js";

const VIEW = "view";
const EDIT = "edit";
const ABORT = "abort";
const ACTIONS = [VIEW, EDIT, ABORT].map((key) => ({ key, label: key }));

/** A check of the quality gate that failed and that no agent fixes: its name, one line for each problem and everything the check printed. */
export type GateAsk = { check: string; problems: string[]; output: string };

/** The question about the failed check: the problems, or the whole output. */
function question({ check, problems, output }: GateAsk, whole: boolean): string {
  return [`The quality gate failed at the ${check} check:`, whole ? output : problems.join(NEWLINE)].join(NEWLINE);
}

/** Puts the failed check to the person: returns the exit code the process ends with. Only viewing and aborting are possible until resuming exists: aborting moves the run to ABORTED, any other answer ends the run with an error. Without a terminal the question is saved. */
export async function gateQuestion(bus: Started["bus"], input: ReviewInput, ask: GateAsk): Promise<number> {
  if (!input.isTTY) return bus.emit({ type: WAITING_INPUT, request: { id: "quality-gate", prompt: question(ask, false), actions: ACTIONS } }) ?? 1;
  let whole = false;
  for (;;) {
    const answer = await input.choose(question(ask, whole), ACTIONS.map(({ key }) => key));
    if (answer === ABORT) return transition(bus, STATE.qualityGate, STATE.aborted, `the person chose to ${ABORT} after the ${ask.check} check failed`) ?? 1;
    if (answer !== VIEW) return bus.emit({ type: ERROR_EVENT, message: `the quality gate: "${answer}" has to wait for resuming (FR-RUN-09): only ${ABORT} is possible now` }) ?? 1;
    whole = true;
  }
}
