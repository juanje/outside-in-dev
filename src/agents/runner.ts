import { mkdirSync } from "node:fs";
import { join } from "node:path";
import * as pi from "@earendil-works/pi-coding-agent";
import type { Toolset } from "./toolset.js";

/** The parts of the Pi SDK that oid uses; tests inject a fake one. */
export type PiSdk = Pick<typeof pi, "createAgentSession" | "DefaultResourceLoader" | "SessionManager">;

/** What a task's session needs: where it works, oid's agent directory, where its transcript goes, oid's own system prompt and, when the step restricts them, its tools. */
export type SessionRequest = { worktree: string; agentDir: string; sessionsDir: string; systemPrompt: string; toolset?: Toolset };

/** Where oid keeps the Pi agent directory of its sessions, so that Pi never reads the user's own `~/.pi/agent`. `OID_AGENT_DIR` overrides the default. */
export function oidAgentDir(env: { HOME?: string; OID_AGENT_DIR?: string }): string {
  return env.OID_AGENT_DIR ?? join(env.HOME ?? "", ".config", "oid", "agent");
}

/** Opens a new Pi session that reads oid's agent directory and nothing of the user's own configuration. */
export async function openAgentSession(request: SessionRequest, sdk: PiSdk = pi) {
  const resourceLoader = new sdk.DefaultResourceLoader({
    cwd: request.worktree,
    agentDir: request.agentDir,
    noSkills: true,
    noContextFiles: true,
    noExtensions: true,
    noPromptTemplates: true,
    noThemes: true,
    systemPromptOverride: () => request.systemPrompt,
  });
  await resourceLoader.reload();
  mkdirSync(request.sessionsDir, { recursive: true });
  const sessionManager = sdk.SessionManager.create(request.worktree, request.sessionsDir);
  const tools = request.toolset && { tools: request.toolset.names, customTools: request.toolset.customTools, excludeTools: request.toolset.excludeTools };
  const { session } = await sdk.createAgentSession({ cwd: request.worktree, agentDir: request.agentDir, resourceLoader, sessionManager, ...tools });
  return session;
}
