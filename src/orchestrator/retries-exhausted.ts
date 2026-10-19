import { ERROR_EVENT, WAITING_INPUT } from "../events/types.js";
import { type Started, STATE, transition } from "./begin.js";
import { ABORT, REWRITE, REWRITE_STEPS, Redirect, type RedirectAction, RETRY, SKIP_FR, SKIP_SCENARIO } from "./redirect.js";
import type { ReviewInput } from "./services.js";

/** The actions the person has when a state cannot go on by itself. */
const STUCK_ACTIONS = [RETRY, REWRITE, REWRITE_STEPS, SKIP_SCENARIO, SKIP_FR, ABORT].map((key) => ({ key, label: key }));

/** The actions a state does not offer: there is no unit test to rewrite, and its retry already writes the steps again, while the steps are written; and no unit test, steps or scenario of its own while the feature files are written or the quality gate fixes errors. */
const NOT_OFFERED: Record<string, string[]> = {
  [STATE.bddRed]: [REWRITE, REWRITE_STEPS],
  [STATE.featureWrite]: [REWRITE, REWRITE_STEPS, SKIP_SCENARIO],
  [STATE.qualityFix]: [REWRITE, REWRITE_STEPS, SKIP_SCENARIO],
};

/** What the person is asked for after choosing an action that sends the work back to a writer: the note for the writer of the unit test or of the steps. */
const NOTE_PROMPTS: Record<string, string> = {
  [REWRITE]: "What should the next test writer know?",
  [REWRITE_STEPS]: "What should the next step writer know?",
};

/** A state that cannot go on: the question's id, its text, the state, whose it is and why it cannot (what a redirect carries). */
export type StuckState = { id: string; prompt: string; state: string; label: string; reason: string; diagnosis?: { action: string; detail: string } };

/** The note a rewrite carries to its writer: the agent's diagnosis when the action is the one that answers it, then the person's note. */
function withDiagnosis(action: string, diagnosis: StuckState["diagnosis"], note: string): string {
  return diagnosis?.action === action ? [diagnosis.detail, note].filter((part) => part !== "").join("\n\n") : note;
}

/** Puts a state that cannot go on to the person: returns the exit code the process ends with, or the note of the person who has the agent try once more; the other actions throw a `Redirect` for whoever owns the scenario or the feature. */
export async function askWhatNext(bus: Started["bus"], input: ReviewInput, { id, prompt, state, label, reason, diagnosis }: StuckState): Promise<number | { note: string }> {
  const left = NOT_OFFERED[state] ?? [];
  const actions = STUCK_ACTIONS.filter(({ key }) => !left.includes(key));
  if (!input.isTTY) return bus.emit({ type: WAITING_INPUT, request: { id, prompt, actions } }) ?? 1;
  const answer = await input.choose(prompt, actions.map(({ key }) => key));
  if (!actions.some(({ key }) => key === answer)) return bus.emit({ type: ERROR_EVENT, message: `${label}: "${answer}" is not an answer: ${prompt}` }) ?? 1;
  if (answer === RETRY) return { note: await input.line("What should the agent know for one more attempt?") };
  if (answer !== ABORT) throw new Redirect(answer as RedirectAction, reason, withDiagnosis(answer, diagnosis, answer in NOTE_PROMPTS ? await input.line(NOTE_PROMPTS[answer]!) : ""));
  return transition(bus, state, STATE.aborted, `${label}: the person chose to ${ABORT}`) ?? 1;
}

/** An agent that reported it is blocked: the state, whose it is and the sentence that says why. */
export type BlockedAgent = { state: string; label: string; problem: string; agent?: { reason: string; detail: string } };

/** The rewrite that answers a blocked agent's diagnosis of a wrong unit test or a wrong step definition. */
const DIAGNOSED_BY: Record<string, string> = { wrong_test: REWRITE, wrong_step: REWRITE_STEPS };

/** Puts an agent that is blocked to the person, with the actions of a state that ran out of retries; the diagnosis of a wrong unit test or step goes to the matching rewrite. */
export async function askAboutBlocked(bus: Started["bus"], input: ReviewInput, { state, label, problem, agent }: BlockedAgent): Promise<number | { note: string }> {
  const action = agent === undefined ? undefined : DIAGNOSED_BY[agent.reason];
  return askWhatNext(bus, input, { id: "agent-blocked", prompt: `${state}: ${problem}`, state, label, reason: problem, ...(action === undefined ? {} : { diagnosis: { action, detail: agent!.detail } }) });
}

/** A state whose attempts all failed: the state, whose it is, how many attempts there were and why the last one was rejected. */
export type ExhaustedAttempts = { state: string; label: string; attempts: number; rejected: string };

/** Puts the state that ran out of retries to the person: returns the exit code the process ends with, or the note of the person who has the agent try once more. */
export async function askAfterAttempts(bus: Started["bus"], input: ReviewInput, { state, label, attempts, rejected }: ExhaustedAttempts): Promise<number | { note: string }> {
  return askWhatNext(bus, input, { id: "retries-exhausted", prompt: `${label} failed ${attempts} attempts of ${state}: ${rejected}`, state, label, reason: rejected });
}
