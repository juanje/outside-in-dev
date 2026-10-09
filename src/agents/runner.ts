import { mkdirSync } from "node:fs";
import { join } from "node:path";
import * as pi from "@earendil-works/pi-coding-agent";
import { AUTH_FILE, MODEL_SEPARATOR, MODELS_FILE } from "../artifacts/user-config.js";
import type { CycleState } from "./profiles.js";
import { collectReport } from "./report-events.js";
import { ABORTED, checkResponse, EMPTY, PROVIDER_ERROR, type ResponseVerdict } from "./response-check.js";
import type { AgentReport } from "./tools/report.js";
import type { Toolset } from "./toolset.js";
import { changesSince, snapshotWorktree, type WorktreeSnapshot } from "./worktree-changes.js";

/** The parts of the Pi SDK that oid uses; tests inject a fake one. */
export type PiSdk = Pick<typeof pi, "createAgentSession" | "DefaultResourceLoader" | "SessionManager" | "ModelRuntime">;

/** What a task's session needs: where it works, oid's agent directory, where its transcript goes, oid's own system prompt and, when the step restricts them, its tools; and, when the attempt names them, the model (as `provider/id`) and the thinking level it runs with. */
export type SessionRequest = { worktree: string; agentDir: string; sessionsDir: string; systemPrompt: string; toolset?: Toolset; model?: string; thinkingLevel?: string };

/** The Pi runtime of oid's agent directory and the model it holds for a `provider/id` name; refused when the runtime has no such model. */
async function modelOf(sdk: PiSdk, agentDir: string, name: string) {
  const modelRuntime = await sdk.ModelRuntime.create({ authPath: join(agentDir, AUTH_FILE), modelsPath: join(agentDir, MODELS_FILE) });
  const [provider = "", ...rest] = name.split(MODEL_SEPARATOR);
  const model = modelRuntime.getModel(provider, rest.join(MODEL_SEPARATOR));
  if (model === undefined) throw new Error(`the model "${name}" is not one of the models Pi knows`);
  return { modelRuntime, model };
}

export { oidAgentDir } from "../artifacts/user-config.js";

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
  const resolved = request.model === undefined ? undefined : await modelOf(sdk, request.agentDir, request.model);
  const thinking = request.thinkingLevel === undefined ? undefined : { thinkingLevel: request.thinkingLevel as NonNullable<Parameters<PiSdk["createAgentSession"]>[0]>["thinkingLevel"] };
  const { session } = await sdk.createAgentSession({ cwd: request.worktree, agentDir: request.agentDir, resourceLoader, sessionManager, ...tools, ...resolved, ...thinking });
  return session;
}

/** What an agent is asked to do: the step it runs for and the task text, and, for an attempt that names them, the model (as `provider/id`) and the thinking level it runs with. */
export type AgentTask = { state: CycleState; prompt: string; model?: string; thinkingLevel?: string };

/** The part of a Pi session that `runAgent` uses. */
type RunnableSession = { subscribe(listener: (event: unknown) => void): () => void; prompt(text: string): Promise<void>; abort?(): Promise<void>; dispose(): void };

/** What stops a session before it ends: the limit that was reached, and what was seen. */
export const LIMIT = "limit";
type LimitHit = { limit: "turns" | "timeout" | "cost"; detail: string };

/** The limits of one session: the assistant messages it may send, the milliseconds it may run, and what it is told of the cost of each message (it answers whether the cost is over its limit). */
export type SessionLimits = { maxTurns?: number; timeoutMs?: number; onUsage?: (spent: { usd: number; tokens: number }) => boolean };

/** The pauses before each retry of a transient provider error (the number of delays is the number of retries) and the function that waits: tests inject a recorder. */
type Backoff = { delaysMs?: number[]; sleep?: (ms: number) => Promise<void> };

/** Where an agent works and how its session is opened: production passes `openProfileSession` (which is why runner.ts does not import it), tests a fake. */
export type RunContext = { worktree: string; agentDir: string; sessionsDir: string; openSession: (task: AgentTask, context: RunContext) => Promise<RunnableSession>; backoff?: Backoff; limits?: SessionLimits };

/** How an attempt ended: done with its report, blocked with the agent's reason, failed with oid's reason, or stopped to ask the human (the provider failed in a way a retry cannot fix). */
export const FAILED = "failed";
export const DONE = "done";
export const BLOCKED = "blocked";
export const ASK = "ask";
export type AttemptOutcome = ({ status: typeof LIMIT } & LimitHit) | { status: typeof ASK; reason: string; detail: string } | { status: typeof FAILED; reason: string } | { status: typeof DONE; report: AgentReport } | { status: typeof BLOCKED; reason: string; detail: string };

const NOTHING_PRODUCED = "the agent produced nothing: its response had no content";
const TURN_ABORTED = "the turn was aborted before the agent finished";
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

const SECOND_MS = 1000;
const FIRST_RETRY_DELAY_SECONDS = 5;
const SECOND_RETRY_DELAY_SECONDS = 20;
const THIRD_RETRY_DELAY_SECONDS = 60;
const DEFAULT_RETRY_DELAYS_MS = [FIRST_RETRY_DELAY_SECONDS, SECOND_RETRY_DELAY_SECONDS, THIRD_RETRY_DELAY_SECONDS].map((seconds) => seconds * SECOND_MS);

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The `message_end` of a provider error that a rejected prompt stands for, so that it is classified like one that resolved. */
function rejectedPrompt(error: unknown): unknown {
  return { type: "message_end", message: { role: "assistant", stopReason: PROVIDER_ERROR, errorMessage: error instanceof Error ? error.message : String(error) } };
}

type AssistantEnd = { type?: string; message?: { role?: string; stopReason?: string; usage?: { totalTokens?: number; cost?: { total?: number } } } };

const MS_PER_SECOND = 1000;

/** Watches a session against its limits, and calls `abort` the first time one is reached: the turns, counted on the assistant messages, are limited only when another model call would follow; the time runs from here until `end`. */
function watchLimits(limits: SessionLimits, abort: () => void) {
  let turns = 0;
  let hit: LimitHit | undefined;
  const stop = (reached: LimitHit): void => {
    if (hit !== undefined) return;
    hit = reached;
    abort();
  };
  const timer = limits.timeoutMs === undefined ? undefined : setTimeout(() => stop({ limit: "timeout", detail: `the session ran longer than ${limits.timeoutMs! / MS_PER_SECOND} s` }), limits.timeoutMs);
  return {
    see(event: unknown): void {
      const { type, message } = event as AssistantEnd;
      if (type !== "message_end" || message?.role !== "assistant") return;
      turns += 1;
      const overBudget = limits.onUsage?.({ usd: message.usage?.cost?.total ?? 0, tokens: message.usage?.totalTokens ?? 0 }) === true;
      if (message.stopReason !== "toolUse") return;
      if (overBudget) stop({ limit: "cost", detail: "the cost limit was reached" });
      else if (turns >= (limits.maxTurns ?? Infinity)) stop({ limit: "turns", detail: `the agent used ${turns} turns` });
    },
    end: () => clearTimeout(timer),
    hit: () => hit,
  };
}

/** Opens a session, runs the task in it and returns the events it emitted, and the limit that stopped it, if one did. The session is always ended; a prompt that rejects ends as a provider error. */
async function promptOnce(task: AgentTask, context: RunContext): Promise<{ events: unknown[]; hit?: LimitHit }> {
  const session = await context.openSession(task, context);
  const events: unknown[] = [];
  const watch = watchLimits(context.limits ?? {}, () => void session.abort?.());
  const unsubscribe = session.subscribe((event) => {
    events.push(event);
    watch.see(event);
  });
  try {
    await session.prompt(task.prompt);
  } catch (error) {
    events.push(rejectedPrompt(error));
  } finally {
    watch.end();
    unsubscribe();
    session.dispose();
  }
  return { events, hit: watch.hit() };
}

/** Runs one agent task and judges how it ended. A transient provider error is retried in a new session after a pause, without counting as an attempt; the response is judged before the report. */
export async function runAgent(task: AgentTask, context: RunContext): Promise<AttemptOutcome> {
  const delays = context.backoff?.delaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const sleep = context.backoff?.sleep ?? realSleep;
  const before = snapshotWorktree(context.worktree);
  for (let retry = 0; ; retry += 1) {
    const { events, hit } = await promptOnce(task, context);
    if (hit !== undefined) return { status: LIMIT, ...hit };
    const response = checkResponse(events);
    if (response.kind === PROVIDER_ERROR && response.transient && retry < delays.length) {
      await sleep(delays[retry] ?? 0);
      continue;
    }
    return judge(response, events, context, before);
  }
}

/** The outcome of a response that is not retried: a provider error stops and asks, an empty or aborted turn fails, and only a productive one has its report examined. */
function judge(response: ResponseVerdict, events: unknown[], context: RunContext, before: WorktreeSnapshot): AttemptOutcome {
  if (response.kind === PROVIDER_ERROR) return { status: ASK, reason: "the provider failed", detail: response.message };
  if (response.kind === EMPTY) return { status: FAILED, reason: NOTHING_PRODUCED };
  if (response.kind === ABORTED) return { status: FAILED, reason: TURN_ABORTED };
  return judgeReport(events, context, before);
}

/** Judges the report of a productive response against the files that changed since `before`. */
function judgeReport(events: unknown[], context: RunContext, before: WorktreeSnapshot): AttemptOutcome {
  const report = collectReport(events);
  if (report === undefined) return { status: FAILED, reason: NO_REPORT };
  if (report.status === BLOCKED) return { status: BLOCKED, reason: report.reason, detail: report.detail };
  const mismatch = diffMismatch(report.files, changesSince(context.worktree, before));
  if (mismatch !== undefined) return { status: FAILED, reason: mismatch };
  return { status: DONE, report };
}
