import { names } from "./names.js";
import type { ProjectConfig } from "../artifacts/project-config.js";

/** The steps of the cycle that run an agent. */
export const CYCLE_STATES = ["FEATURE_WRITE", "BDD_RED", "TDD_RED", "CODE_GREEN", "REFACTOR", "FR_REFACTOR", "QUALITY_FIX"] as const;
export type CycleState = (typeof CYCLE_STATES)[number];

/** What a step's agent may do: its tools, the globs it may write and read (relative to the worktree), the globs nobody writes, and the commands its shell may run. */
export type Profile = { state: CycleState; builtins: string[]; write: string[]; read: string[]; deny: string[]; shell: boolean; commands: string[] };

const READ_TOOLS = names("read grep find ls");
const EDIT_TOOLS = [...READ_TOOLS, ...names("write edit")];
const SHELL_TOOLS = [...EDIT_TOOLS, ...names("bash")];
const WHOLE_REPO = ["**"];
const DOMAIN = "DOMAIN.md";

/** The files only the orchestrator writes, whatever the step. */
function orchestratorFiles(config: ProjectConfig): string[] {
  return [
    config.paths.progress,
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "**/tsconfig*.json",
    "vitest.config.*",
    "cucumber.*",
    ".outside-in*",
    ".outside-in*/**",
    ".git",
    ".git/**",
  ];
}

function gateCommands(config: ProjectConfig): string[] {
  const { unit, bdd, typecheck, format, lint, extra_checks } = config.commands;
  return [unit, bdd, typecheck, format, lint, ...extra_checks].filter((command): command is string => command !== null);
}

type Grant = { write: string[]; read: string[]; shell: boolean };

function grantFor(state: CycleState, config: ProjectConfig): Grant {
  const { paths } = config;
  switch (state) {
    case "FEATURE_WRITE":
      return { write: paths.bdd_features, read: [paths.spec, DOMAIN, ...paths.bdd_features], shell: false };
    case "BDD_RED":
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
    shell,
    commands: shell ? gateCommands(config) : [],
  };
}
