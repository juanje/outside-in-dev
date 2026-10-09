import { TOOL_MODE, toolInvocation } from "../artifacts/lint-tools.js";
import type { ProjectConfig } from "../artifacts/project-config.js";
import { REAL_RUNNERS, type Runners } from "../artifacts/verify-runner.js";

/** Runs the project's deterministic fixes: its linter's automatic fixes, then its formatter. What the tools exit with does not matter here: the checks judge what is left. */
export function autofix(worktree: string, config: ProjectConfig, runners: Runners = REAL_RUNNERS): void {
  const { lint, format } = config.commands;
  for (const command of [lint, format]) if (command !== null) runners.command(worktree, toolInvocation(worktree, command, TOOL_MODE.fix));
}
