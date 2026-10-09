import { type GateError, lintErrors, recognisedTool, TOOL_MODE, toolInvocation } from "../artifacts/lint-tools.js";
import { typeErrors } from "../artifacts/tsc-report.js";
import type { Runners } from "../artifacts/verify-runner.js";

/** The errors a tool reported and what it printed. */
export type ErrorReport = { errors: GateError[]; output: string };

/** The errors ESLint reports for the project, with its JSON report; undefined when the linter is not ESLint, whose errors oid cannot read. */
export function lintReport(worktree: string, command: string, runners: Runners): ErrorReport | undefined {
  if (recognisedTool(worktree, command) !== "eslint") return undefined;
  const { stdout } = runners.command(worktree, toolInvocation(worktree, command, TOOL_MODE.check));
  return { errors: lintErrors(stdout, worktree), output: stdout };
}

/** The errors of the type check of the whole project, with what it printed. */
export function typeReport(worktree: string, command: string, runners: Runners): ErrorReport {
  const { output } = runners.typecheck(worktree, command);
  return { errors: typeErrors(output, worktree), output };
}
