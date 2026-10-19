import { type AgentTask, type AttemptOutcome, BLOCKED } from "../agents/runner.js";
import { outcomeProblem, outcomeStop } from "./agent-run.js";
import { Blocked, TryAgain } from "./redirect.js";
import type { CycleState } from "../agents/profiles.js";
import { headCommit } from "../artifacts/git-workspace.js";
import { rollback } from "../artifacts/git-checkpoints.js";
import { NEWLINE } from "../artifacts/lines.js";
import { renderRejection } from "../artifacts/rejection.js";
import { loadProjectConfig, loadRetryLimit } from "../artifacts/project-config.js";
import { attemptsUsedBy, clearAttemptsUsed, recordAttemptsUsed } from "./session.js";
import { loadUserModels } from "../artifacts/user-config.js";
import { ERROR_EVENT } from "../events/types.js";
import { type AttemptInfo, type AttemptSpec, type Exhausted, isExhausted, isRejection, type Rejection, runAttempts } from "./attempts.js";
import { isExitCode, type Started } from "./begin.js";
import { settleBudget } from "./budget-settle.js";
import { askAboutBlocked, askAfterAttempts, type ExhaustedAttempts } from "./retries-exhausted.js";
import type { FeatureServices, ReviewInput } from "./services.js";

/** The task of an attempt: the prompt with what the attempt is told about the ones before it, and the effort it runs with. */
export function attemptTask(state: CycleState, prompt: string, { note, effort }: AttemptInfo): AgentTask {
  return { state, prompt: note === "" ? prompt : `${prompt}${NEWLINE}${NEWLINE}${note}`, model: effort.model, thinkingLevel: effort.thinkingLevel };
}

/** What stops an attempt whose agent did not finish with a report: the rejection of the attempt when the agent failed, the exit code of the process when the agent is blocked or the provider failed; nothing when the agent is done. */
export function agentStop({ bus }: Started, label: string, outcome: AttemptOutcome): Rejection | number | undefined {
  if (outcome.status === BLOCKED) throw new Blocked(outcomeProblem(label, outcome)!, { reason: outcome.reason, detail: outcome.detail });
  const stopped = outcomeStop(label, outcome);
  if (stopped === undefined || isRejection(stopped)) return stopped;
  return bus.emit({ type: ERROR_EVENT, message: stopped.stop }) ?? 1;
}

/** What one state runs: its name, the role of its agent, whose it is, and one attempt, which returns what it came to, the exit code of the process when the run ends there, or the rejection of its gate. */
export type StateAttempts<T, R = never> = {
  state: string;
  role: string;
  label: string;
  run: (info: AttemptInfo) => Promise<T | number | Rejection>;
  /** What a state that handles the last rejection itself, once the retries run out, does with it; without it the person is asked. */
  whenExhausted?: (exhausted: Exhausted) => R;
};

/** The attempts of a state as they run in the project: the retries it allows, the models it names, and a restore that returns the worktree to where it is now. */
export function attemptSpec<T>(started: Started, services: FeatureServices, { state, role, run }: Pick<AttemptSpec<T>, "state" | "role" | "run">): AttemptSpec<T> {
  const { bus, workspace } = started;
  const config = loadProjectConfig(workspace.path);
  const base = headCommit(workspace.path);
  const restore = () => rollback(workspace, base, [...config.paths.source, ...config.paths.unit_tests, ...config.paths.bdd_steps]);
  return { bus, state, role, retries: loadRetryLimit(workspace.path), models: loadUserModels(services.configDir), restore, beforeCall: () => settleBudget(started, services, state), run };
}

/** What follows when the retries ran out: the exit code of the process (a project that allows no retries ends the run with the rejection, as the first failure; otherwise the person is asked), or the note of the person who has the agent try once more. */
async function answerExhausted({ bus }: Started, services: FeatureServices, retries: number, exhausted: ExhaustedAttempts): Promise<number | { note: string }> {
  if (retries === 0) return bus.emit({ type: ERROR_EVENT, message: exhausted.rejected }) ?? 1;
  return askAfterAttempts(bus, services.input ?? { isTTY: false }, exhausted);
}

/** What the saved session says about the attempts of this state and label (where an interrupted state continues, and the note of the person who asked for one more attempt), and how the attempts record themselves there. */
function savedAttempts(cwd: string, state: string, label: string) {
  const resumed = attemptsUsedBy(cwd, state, label);
  const next = resumed === undefined ? undefined : resumed.used + 1;
  return {
    afterAsking: resumed?.person ? { attempt: next!, note: resumed.reason } : undefined,
    from: resumed === undefined || resumed.person ? undefined : { attempt: next!, reason: resumed.reason },
    onRejected: (attempt: number, reason: string) => recordAttemptsUsed(cwd, { state, label, used: attempt, reason }),
    rememberNote: (attempt: number, note: string) => recordAttemptsUsed(cwd, { state, label, used: attempt - 1, reason: note, person: true }),
    forget: () => clearAttemptsUsed(cwd),
  };
}

/** What an attempt that stopped by throwing leads to: the note of the person who has the agent try once more (an agent that is blocked is put to the person; a retry with a note is the person's own answer), or the exit code of the process. Any other error is thrown again. */
async function answerStop(error: unknown, bus: Started["bus"], input: ReviewInput, { state, label }: { state: string; label: string }): Promise<number | { note: string }> {
  if (error instanceof TryAgain) return { note: error.note };
  if (!(error instanceof Blocked)) throw error;
  return askAboutBlocked(bus, input, { state, label, problem: error.problem, agent: error.agent });
}

/** Runs the attempts of a state that retries a rejected attempt from the last checkpoint. A project that allows no retries ends the run with the rejection, as the first failure; otherwise, when the retries run out, the person is asked, and a retry with a note is one more attempt. Returns what an attempt came to, or the exit code of the process. */
export async function attemptsOf<T, R = never>(started: Started, services: FeatureServices, { state, role, label, run, whenExhausted }: StateAttempts<T, R>): Promise<T | R | number> {
  const { bus } = started;
  const input = services.input ?? { isTTY: false };
  let current = 0;
  const spec = attemptSpec<T | number>(started, services, { state, role, run: (info) => ((current = info.attempt), run(info)) });
  const saved = savedAttempts(started.cwd, state, label);
  let afterAsking = saved.afterAsking;
  Object.assign(spec, { from: saved.from, onRejected: saved.onRejected });
  const remember = (attempt: number, note: string) => ((afterAsking = { attempt, note }), saved.rememberNote(attempt, note));
  for (;;) {
    let result: Awaited<ReturnType<typeof runAttempts<T | number>>>;
    try {
      result = await runAttempts({ ...spec, afterAsking });
    } catch (error) {
      const answer = await answerStop(error, bus, input, { state, label });
      if (isExitCode(answer)) return answer;
      spec.restore();
      remember(current + 1, answer.note);
      continue;
    }
    if (!isExhausted(result)) return isExitCode(result) ? result : (saved.forget(), result);
    saved.forget();
    if (whenExhausted !== undefined) return whenExhausted(result);
    const answer = await answerExhausted(started, services, spec.retries, { state, label, attempts: result.attempts, rejected: renderRejection(result) });
    if (isExitCode(answer)) return answer;
    spec.restore();
    remember(result.attempts + 1, answer.note);
  }
}
