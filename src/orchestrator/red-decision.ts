import { trimFailure } from "../commands/verify.js";
import { OUTCOME } from "../artifacts/red-classification.js";
import { NEWLINE } from "../artifacts/lines.js";
import { ERROR_EVENT, WAITING_INPUT } from "../events/types.js";
import type { Rejection } from "./attempts.js";
import type { Started } from "./begin.js";
import type { ReviewInput } from "./services.js";

/** The answer that accepts the Red. */
export const VALID_RED = OUTCOME.valid;
const BUG = "bug";
const TRACE = "trace";
const ACTIONS = [VALID_RED, BUG, TRACE].map((key) => ({ key, label: key }));

const STEP_DEFINITIONS = "step definitions";

/** A Red oid cannot classify: whose it is, why oid cannot tell, the failure message as the runner gave it, what else the run showed about it (the failing step, the output it recorded) and what the person would call wrong if it is a bug (the step definitions by default). */
export type UnclassifiedRed = { label: string; reason: string; message: string; detail?: string; step?: string; subject?: string };

/** The question about the Red: what failed, why oid cannot tell, the failure up to its first stack frame, or all of it, and what else the run showed. */
function question({ label, reason, message, detail }: UnclassifiedRed, whole: boolean): string {
  return [`${label} fails, and oid cannot tell whether it is a valid Red: ${reason}`, whole ? message : trimFailure(message), ...(detail === undefined || detail === "" ? [] : [detail])].join(NEWLINE);
}

/** Why the run ends when the answer is not an action. */
function refusal(label: string, answer: string): string {
  return `${label}: "${answer}" is not an answer: use ${VALID_RED}, ${BUG} or ${TRACE}`;
}

/** The rejection of the attempt when the person judges the failure a bug: what the person judged, the failure up to its stack, and the failing step when there is one. */
function bugRejection({ label, message, step, subject = STEP_DEFINITIONS }: UnclassifiedRed): Rejection {
  return { rejected: [`${label}: the person judged the failure to be a bug in the ${subject}`, `the failure: ${trimFailure(message)}`, ...(step === undefined ? [] : [`failing step: ${step}`])].join(NEWLINE) };
}

/** Puts the Red to the person who can classify it: returns "valid" when it is, the rejection of the attempt when the person judges it a bug, or the exit code of the process when the run ends. */
export async function decideRed(bus: Started["bus"], input: ReviewInput, red: UnclassifiedRed): Promise<typeof VALID_RED | number | Rejection> {
  if (!input.isTTY) return bus.emit({ type: WAITING_INPUT, request: { id: "bdd-red-decision", prompt: question(red, false), actions: ACTIONS } }) ?? 1;
  let whole = false;
  for (;;) {
    const answer = await input.choose(question(red, whole), ACTIONS.map(({ key }) => key));
    if (answer === VALID_RED) return VALID_RED;
    if (answer === BUG) return bugRejection(red);
    if (answer !== TRACE) return bus.emit({ type: ERROR_EVENT, message: refusal(red.label, answer) }) ?? 1;
    whole = true;
  }
}
