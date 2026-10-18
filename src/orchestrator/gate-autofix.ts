import { TOOL_MODE, toolInvocation } from "../artifacts/lint-tools.js";
import type { ProjectConfig } from "../artifacts/project-config.js";
import { REAL_RUNNERS, type Runners } from "../artifacts/verify-runner.js";
import { whenTimedOut } from "./command-timeout.js";
import { type GateOutcome, timeoutAsk } from "./gate-checks.js";

/** Runs the project's deterministic fixes: its linter's automatic fixes, then its formatter. What the tools exit with does not matter here: the checks judge what is left. A fix that does not end within its limit stops the fixes and is a failed check for a person. */
export function autofix(worktree: string, config: ProjectConfig, runners: Runners = REAL_RUNNERS): GateOutcome | undefined {
  const { lint, format } = config.commands;
  for (const command of [lint, format]) {
    if (command === null) continue;
    const outcome = whenTimedOut(() => void runners.command(worktree, toolInvocation(worktree, command, TOOL_MODE.fix)), timeoutAsk);
    if (outcome !== undefined) return outcome;
  }
  return undefined;
}
