import { type AgentTask, type AttemptOutcome, LIMIT, runAgent } from "../agents/runner.js";
import { headCommit } from "../artifacts/git-workspace.js";
import { rollback } from "../artifacts/git-checkpoints.js";
import { loadBudgetLimits, loadProjectConfig } from "../artifacts/project-config.js";
import { agentContext } from "./agent-run.js";
import type { Started } from "./begin.js";
import { costStop, sessionLimits } from "./budget.js";
import { askToExtend, settleBudget } from "./budget-settle.js";
import type { FeatureServices } from "./services.js";
import { extensionsOf, recordSpend, spendOf } from "./session.js";

/** The call to bill: the feature whose cost it adds to, and how to announce its agent again when the session has to run again. */
export type BillableCall = { fr: string; announce: () => void };

/** Runs an agent task as a billable call: the cost limits are settled before each session, the cost of every message goes to the saved session, and a session that reaches a limit is stopped. A limit of the cost, or of the turns or the time of the session, puts the person a question; extending rolls the worktree back to where the call began and runs the task again, in a new session that is announced again; any other answer stops the run (it throws `RunStopped`). */
export async function runBillable(started: Started, services: FeatureServices, task: AgentTask, { fr, announce }: BillableCall): Promise<AttemptOutcome> {
  const { cwd, workspace } = started;
  const config = loadProjectConfig(workspace.path);
  const limits = loadBudgetLimits(workspace.path);
  const base = headCommit(workspace.path);
  const onUsage = (spent: { usd: number; tokens: number }): boolean => {
    recordSpend(cwd, fr, spent);
    return costStop({ spend: spendOf(cwd), fr, limits, extensions: extensionsOf(cwd) }) !== undefined;
  };
  for (let extended = 0, first = true; ; first = false) {
    await settleBudget(started, services, task.state, fr);
    if (!first) announce();
    const outcome = await runAgent(task, { ...agentContext(started, services), limits: sessionLimits(limits, extended, onUsage) });
    if (outcome.status !== LIMIT) return outcome;
    rollback(workspace, base, [...config.paths.source, ...config.paths.unit_tests, ...config.paths.bdd_steps, ...config.paths.bdd_features]);
    if (outcome.limit === "cost") continue;
    await askToExtend(started, services, { state: task.state, reason: outcome.detail });
    extended += 1;
  }
}
