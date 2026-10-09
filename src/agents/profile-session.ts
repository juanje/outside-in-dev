import * as pi from "@earendil-works/pi-coding-agent";
import { type Installer, runInstall } from "../artifacts/git-dependencies.js";
import { loadProjectConfig } from "../artifacts/project-config.js";
import { installEditHints } from "./edit-hints.js";
import { type CycleState, FEATURE_WRITE, type Profile, profileFor } from "./profiles.js";
import { openAgentSession, type PiSdk } from "./runner.js";
import { installSandbox } from "./sandbox.js";
import { buildToolset } from "./toolset.js";
import { reportTool } from "./tools/report.js";
import { type DependencyDecision, type DependencyRequest, requestDependencyTool } from "./tools/request-dependency.js";

/** What a step's session needs: the step, where it works, oid's agent directory and where its transcript goes. */
export type ProfileSessionRequest = {
  state: CycleState;
  worktree: string;
  agentDir: string;
  sessionsDir: string;
  /** The model (as `provider/id`) and the thinking level of the attempt; without them Pi chooses. */
  model?: string;
  thinkingLevel?: string;
  /** Who approves a requested package; without one no request is approved. */
  approveDependency?: (request: DependencyRequest) => Promise<DependencyDecision>;
  /** How a package manager command runs; by default the real one. */
  installDependency?: Installer;
};

function systemPromptFor(profile: Profile): string {
  const lines = [`You are an oid agent working on the ${profile.state} step of a feature, in the project's worktree. Do only the task you are given.`];
  lines.push("End the task: call the report tool, once, to say whether you finished or are blocked, and list every file you changed. The orchestrator runs git and the tests when you finish; you do not.");
  if (profile.shell) {
    lines.push(`Before you report the task done, run the project's quality gate and read its output: ${profile.commands.join(" and ")}. Fix what it reports.`);
    lines.push("Reuse first: search the reuse catalogue in your task before you write a new function or constant, and reuse what exists.");
  }
  return lines.join("\n\n");
}

/** Opens the session of a step: its tools and system prompt, with the sandbox of its profile installed on the session. */
export async function openProfileSession(request: ProfileSessionRequest, sdk: PiSdk = pi) {
  const profile = profileFor(request.state, loadProjectConfig(request.worktree));
  const dependencyTools = request.state !== FEATURE_WRITE ? [requestDependencyTool({ worktree: request.worktree, approve: request.approveDependency, install: request.installDependency ?? runInstall })] : [];
  const toolset = buildToolset(profile, [reportTool, ...dependencyTools]);
  const session = await openAgentSession({ worktree: request.worktree, agentDir: request.agentDir, sessionsDir: request.sessionsDir, systemPrompt: systemPromptFor(profile), toolset, model: request.model, thinkingLevel: request.thinkingLevel }, sdk);
  installSandbox(session, profile, { worktree: request.worktree, tools: toolset.names });
  if (toolset.names.includes("edit")) installEditHints(session);
  return session;
}
