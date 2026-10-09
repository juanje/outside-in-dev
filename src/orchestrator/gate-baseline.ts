import { errorKey } from "../artifacts/gate-errors.js";
import type { GateError } from "../artifacts/lint-tools.js";
import type { ProjectConfig } from "../artifacts/project-config.js";
import { REAL_RUNNERS, type Runners } from "../artifacts/verify-runner.js";
import { checkViolations } from "../commands/check.js";
import type { GateBaseline } from "./gate-checks.js";
import { lintReport, typeReport } from "./gate-reports.js";

/** What the project has before the run changes it, for the quality gate to judge only what is new: the identity of its lint errors, its type errors and its traceability violations. */
export function gateBaseline(worktree: string, config: ProjectConfig, runners: Runners = REAL_RUNNERS): GateBaseline {
  const { lint, typecheck } = config.commands;
  const keys = (errors: GateError[]) => errors.map((error) => errorKey(worktree, error));
  return {
    lint: lint === null ? [] : keys(lintReport(worktree, lint, runners)?.errors ?? []),
    types: keys(typeReport(worktree, typecheck, runners).errors),
    traceability: checkViolations(worktree).map(({ message }) => message),
  };
}
