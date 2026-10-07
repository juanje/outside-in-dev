import { names } from "./names.js";
import type { ProjectConfig } from "../artifacts/project-config.js";

/** The steps of the cycle that run an agent. */
/** The step that writes feature files, the only one whose agent writes neither tests nor code. */
export const FEATURE_WRITE = "FEATURE_WRITE";
/** The step that writes step definitions. */
export const BDD_RED = "BDD_RED";
export const CYCLE_STATES = [FEATURE_WRITE, BDD_RED, "TDD_RED", "CODE_GREEN", "REFACTOR", "FR_REFACTOR", "QUALITY_FIX"] as const;
export type CycleState = (typeof CYCLE_STATES)[number];

/** What a step's agent may do: its tools, the globs it may write and read (relative to the worktree), the globs nobody writes, the orchestrator state no shell argument may name, and the commands its shell may run. */
export type Profile = { state: CycleState; builtins: string[]; write: string[]; read: string[]; deny: string[]; orchestratorState: string[]; shell: boolean; commands: string[] };

const READ_TOOLS = names("read grep find ls");
const EDIT_TOOLS = [...READ_TOOLS, ...names("write edit")];
const SHELL_TOOLS = [...EDIT_TOOLS, ...names("bash")];
const WHOLE_REPO = ["**"];
const DOMAIN = "DOMAIN.md";

/** The orchestrator's own state: the progress file, its local folder and git. */
function orchestratorState(config: ProjectConfig): string[] {
  return [config.paths.progress, ".outside-in*", ".outside-in*/**", ".git", ".git/**"];
}

/** The files only the orchestrator writes, whatever the step. */
function orchestratorFiles(config: ProjectConfig): string[] {
  return [...orchestratorState(config), "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb", "**/tsconfig*.json", "vitest.config.*", "cucumber.*"];
}

function gateCommands(config: ProjectConfig): string[] {
  const { unit, bdd, typecheck, format, lint, extra_checks } = config.commands;
  return [unit, bdd, typecheck, format, lint, ...extra_checks].filter((command): command is string => command !== null);
}

type Grant = { write: string[]; read: string[]; shell: boolean };

function grantFor(state: CycleState, config: ProjectConfig): Grant {
  const { paths } = config;
  switch (state) {
    case FEATURE_WRITE:
      return { write: paths.bdd_features, read: [paths.spec, DOMAIN, ...paths.bdd_features], shell: false };
    case BDD_RED:
      return { write: paths.bdd_steps, read: [...paths.bdd_features, ...paths.bdd_steps, DOMAIN], shell: false };
    case "TDD_RED":
      return { write: paths.unit_tests, read: [...paths.unit_tests, ...paths.bdd_features, ...paths.bdd_steps], shell: false };
    case "CODE_GREEN":
    case "REFACTOR":
      return { write: paths.source, read: WHOLE_REPO, shell: true };
    case "FR_REFACTOR":
    case "QUALITY_FIX":
      return { write: [...paths.source, ...paths.docs], read: WHOLE_REPO, shell: true };
  }
}

/** The profile of a step in a project: the tools, paths and shell its agent gets. */
export function profileFor(state: CycleState, config: ProjectConfig): Profile {
  const { write, read, shell } = grantFor(state, config);
  return {
    state,
    builtins: shell ? SHELL_TOOLS : EDIT_TOOLS,
    write,
    read,
    deny: orchestratorFiles(config),
    orchestratorState: orchestratorState(config),
    shell,
    commands: shell ? gateCommands(config) : [],
  };
}
