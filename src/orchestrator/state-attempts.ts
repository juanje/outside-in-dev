import type { AgentTask, AttemptOutcome } from "../agents/runner.js";
import { outcomeStop } from "./agent-run.js";
import type { CycleState } from "../agents/profiles.js";
import { headCommit } from "../artifacts/git-workspace.js";
import { rollback } from "../artifacts/git-checkpoints.js";
import { NEWLINE } from "../artifacts/lines.js";
import { loadProjectConfig, loadRetryLimit } from "../artifacts/project-config.js";
import { ERROR_EVENT } from "../events/types.js";
import { type AttemptInfo, type AttemptSpec, isExhausted, isRejection, type Rejection, runAttempts } from "./attempts.js";
import { isExitCode, type Started } from "./begin.js";
import { askAfterAttempts } from "./retries-exhausted.js";
import type { FeatureServices } from "./services.js";

/** The task of an attempt: the prompt with what the attempt is told about the ones before it, and the effort it runs with. */
export function attemptTask(state: CycleState, prompt: string, { note, effort }: AttemptInfo): AgentTask {
  return { state, prompt: note === "" ? prompt : `${prompt}${NEWLINE}${NEWLINE}${note}`, model: effort.model, thinkingLevel: effort.thinkingLevel };
}

/** What stops an attempt whose agent did not finish with a report: the rejection of the attempt when the agent failed, the exit code of the process when the agent is blocked or the provider failed; nothing when the agent is done. */
export function agentStop({ bus }: Started, label: string, outcome: AttemptOutcome): Rejection | number | undefined {
  const stopped = outcomeStop(label, outcome);
  if (stopped === undefined || isRejection(stopped)) return stopped;
  return bus.emit({ type: ERROR_EVENT, message: stopped.stop }) ?? 1;
}

/** What one state runs: its name, the role of its agent, whose it is, and one attempt, which returns what it came to, the exit code of the process when the run ends there, or the rejection of its gate. */
export type StateAttempts<T> = { state: string; role: string; label: string; run: (info: AttemptInfo) => Promise<T | number | Rejection> };

/** The attempts of a state as they run in the project: the retries it allows, the models it names, and a restore that returns the worktree to where it is now. */
export function attemptSpec<T>({ bus, workspace }: Started, { state, role, run }: Pick<AttemptSpec<T>, "state" | "role" | "run">): AttemptSpec<T> {
  const config = loadProjectConfig(workspace.path);
  const base = headCommit(workspace.path);
  const restore = () => rollback(workspace, base, [...config.paths.source, ...config.paths.unit_tests, ...config.paths.bdd_steps]);
  return { bus, state, role, retries: loadRetryLimit(workspace.path), models: config.models, restore, run };
}

/** Runs the attempts of a state that retries a rejected attempt from the last checkpoint. A project that allows no retries ends the run with the rejection, as the first failure; otherwise, when the retries run out, the person is asked, and a retry with a note is one more attempt. Returns what an attempt came to, or the exit code of the process. */
export async function attemptsOf<T>(started: Started, services: FeatureServices, { state, role, label, run }: StateAttempts<T>): Promise<T | number> {
  const { bus } = started;
  const spec = attemptSpec<T | number>(started, { state, role, run });
  let result = await runAttempts(spec);
  while (isExhausted(result)) {
    if (spec.retries === 0) return bus.emit({ type: ERROR_EVENT, message: result.rejected }) ?? 1;
    const answer = await askAfterAttempts(bus, services.input ?? { isTTY: false }, { state, label, attempts: result.attempts, rejected: result.rejected });
    if (isExitCode(answer)) return answer;
    spec.restore();
    result = await runAttempts({ ...spec, afterAsking: { attempt: result.attempts + 1, note: answer.note } });
  }
  return result;
}
