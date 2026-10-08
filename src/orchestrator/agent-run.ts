import { join } from "node:path";
import { openProfileSession } from "../agents/profile-session.js";
import { ASK, type AgentTask, type AttemptOutcome, BLOCKED, FAILED, type RunContext } from "../agents/runner.js";
import type { Started } from "./begin.js";
import { runDirectory } from "./session.js";
import type { FeatureServices } from "./services.js";

/** Where the agents of a run work and how their sessions open: in the run's worktree, in oid's agent directory, with the sandbox of their step. */
export function agentContext({ cwd, runId, workspace }: Started, services: FeatureServices): RunContext {
  return {
    worktree: workspace.path,
    agentDir: services.agentDir,
    sessionsDir: join(runDirectory(cwd, runId), "sessions"),
    openSession: (task: AgentTask, run: RunContext) => openProfileSession({ state: task.state, worktree: run.worktree, agentDir: run.agentDir, sessionsDir: run.sessionsDir }, services.sdk),
  };
}

/** Why an attempt that did not finish with a report stopped the run, as a sentence that starts with `label`; nothing when the attempt is done. */
export function outcomeProblem(label: string, outcome: AttemptOutcome): string | undefined {
  if (outcome.status === BLOCKED) return `${label}: the agent is blocked (${outcome.reason}): ${outcome.detail}`;
  if (outcome.status === ASK) return `${label}: ${outcome.reason}: ${outcome.detail}`;
  return outcome.status === FAILED ? `${label}: the agent failed: ${outcome.reason}` : undefined;
}
