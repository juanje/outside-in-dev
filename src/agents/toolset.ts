import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { Profile } from "./profiles.js";

/** What `createAgentSession` is given: the allowlist, the custom tool definitions and the tools to exclude. */
export type Toolset = { names: string[]; customTools: ToolDefinition[]; excludeTools: string[] };

const SHELL = "bash";

/** Derives the allowlist and the custom tools from one array, so that a tool in one list cannot be missing from the other; a step without a shell also excludes `bash`. */
export function buildToolset(profile: Profile, customTools: ToolDefinition[]): Toolset {
  return {
    names: [...profile.builtins, ...customTools.map((tool) => tool.name)],
    customTools,
    excludeTools: profile.shell ? [] : [SHELL],
  };
}
