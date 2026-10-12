import { NEWLINE } from "../artifacts/lines.js";
import { ERROR_EVENT, WAITING_INPUT } from "../events/types.js";
import { type Started, STATE, transition } from "./begin.js";
import { ABORT, ACCEPT_GUARD, Redirect, RETRY, SKIP_FR, SKIP_SCENARIO } from "./redirect.js";
import type { ReviewInput } from "./services.js";
import { LIST_SEPARATOR } from "../ui/plain.js";

const ACTIONS = [ACCEPT_GUARD, RETRY, SKIP_SCENARIO, SKIP_FR, ABORT];
const REASON_PROMPT = "Why is this scenario a guard?";
const NOTE_PROMPT = "What should the step writer know for one more attempt?";
const WHY = "the scenario passes before any code";

/** A scenario that passes before any code: how to name it in a message and the step definitions it uses, as the person is shown them. */
export type GuardCandidate = { label: string; steps: string };

/** What the person is told: why the scenario is put to them, and the step definitions to judge. */
function question({ label, steps }: GuardCandidate): string {
  return [
    `${label} passes before any code exists for it, so it has no Red to show that its steps check anything. A scenario that describes what must not happen can be accepted as a guard: it then needs no unit test and counts as passing. Otherwise the steps can be written again to fail without the feature.`,
    steps,
  ].join(NEWLINE);
}

/** Puts a scenario that passes before any code to the person: returns their reason when they accept it as a guard, or their note when they have the step writer try once more; the skips throw a `Redirect`, and an abort returns the exit code of the process. Only this answer accepts a guard; nothing an agent says can. */
export async function askAboutGuard(bus: Started["bus"], input: ReviewInput, candidate: GuardCandidate): Promise<number | { guard: string } | { note: string }> {
  const prompt = question(candidate);
  if (!input.isTTY) return bus.emit({ type: WAITING_INPUT, request: { id: "bdd-red-guard", prompt, actions: ACTIONS.map((key) => ({ key, label: key })) } }) ?? 1;
  const answer = await input.choose(prompt, ACTIONS);
  if (answer === ACCEPT_GUARD) return { guard: await reasonOf(input) };
  if (answer === RETRY) return { note: await input.line(NOTE_PROMPT) };
  if (answer === SKIP_SCENARIO || answer === SKIP_FR) throw new Redirect(answer, WHY, "");
  if (answer === ABORT) return transition(bus, STATE.bddRed, STATE.aborted, `${candidate.label}: the person chose to ${ABORT}`) ?? 1;
  return bus.emit({ type: ERROR_EVENT, message: `${candidate.label}: "${answer}" is not an answer: use ${ACTIONS.join(LIST_SEPARATOR)}` }) ?? 1;
}

/** The reason the person gives for a guard; the question is asked again while the answer is empty. */
async function reasonOf(input: Extract<ReviewInput, { isTTY: true }>): Promise<string> {
  for (;;) {
    const reason = (await input.line(REASON_PROMPT)).trim();
    if (reason !== "") return reason;
  }
}
