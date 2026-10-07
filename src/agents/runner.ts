import { mkdirSync } from "node:fs";
import { join } from "node:path";
import * as pi from "@earendil-works/pi-coding-agent";
import type { CycleState } from "./profiles.js";
import { collectReport } from "./report-events.js";
import type { AgentReport } from "./tools/report.js";
import type { Toolset } from "./toolset.js";
import { changesSince, snapshotWorktree } from "./worktree-changes.js";

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

/** What an agent is asked to do: the step it runs for and the task text. */
export type AgentTask = { state: CycleState; prompt: string };

/** The part of a Pi session that `runAgent` uses. */
type RunnableSession = { subscribe(listener: (event: unknown) => void): () => void; prompt(text: string): Promise<void>; dispose(): void };

/** Where an agent works and how its session is opened: production passes `openProfileSession` (which is why runner.ts does not import it), tests a fake. */
export type RunContext = { worktree: string; agentDir: string; sessionsDir: string; openSession: (task: AgentTask, context: RunContext) => Promise<RunnableSession> };

/** How an attempt ended: done with its report, blocked with the agent's reason, or failed with oid's reason. */
const FAILED = "failed";
const DONE = "done";
const BLOCKED = "blocked";
export type AttemptOutcome = { status: typeof FAILED; reason: string } | { status: typeof DONE; report: AgentReport } | { status: typeof BLOCKED; reason: string; detail: string };

const NO_REPORT = "the agent ended without calling the report tool: no report";

const PART_SEPARATOR = "; ";
const FILE_SEPARATOR = ", ";

function listed(label: string, files: string[]): string {
  return files.length > 0 ? `${label}: ${files.join(FILE_SEPARATOR)}` : "";
}

/** Why the files a report names are not the files that changed, or `undefined` when they are the same. */
function diffMismatch(reported: string[], changed: string[]): string | undefined {
  const missing = changed.filter((file) => !reported.includes(file));
  const extra = reported.filter((file) => !changed.includes(file));
  if (missing.length === 0 && extra.length === 0) return undefined;
  const parts = [listed("missing files", missing), listed("extra files", extra)].filter((part) => part !== "");
  return `the report does not match the files that changed (${parts.join(PART_SEPARATOR)})`;
}

/** Runs one agent task in a new session and judges how it ended. */
export async function runAgent(task: AgentTask, context: RunContext): Promise<AttemptOutcome> {
  const session = await context.openSession(task, context);
  const events: unknown[] = [];
  const unsubscribe = session.subscribe((event) => events.push(event));
  const before = snapshotWorktree(context.worktree);
  try {
    await session.prompt(task.prompt);
  } finally {
    unsubscribe();
    session.dispose();
  }
  const report = collectReport(events);
  if (report === undefined) return { status: FAILED, reason: NO_REPORT };
  if (report.status === BLOCKED) return { status: BLOCKED, reason: report.reason, detail: report.detail };
  const mismatch = diffMismatch(report.files, changesSince(context.worktree, before));
  if (mismatch !== undefined) return { status: FAILED, reason: mismatch };
  return { status: DONE, report };
}
