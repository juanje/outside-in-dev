import { createWriteTool } from "@earendil-works/pi-coding-agent";
import type { PiSdk } from "../../src/agents/runner.js";

export type AgentFile = { path: string; content: string };
type Task = { fr: string; text: string };
type Report = { status: "done"; files: string[]; summary: string; reason?: string } | { status: "blocked"; reason: string; detail: string };
type Verdict = { block?: boolean } | undefined;
type Hook = (context: { assistantMessage: unknown; toolCall: unknown; args: unknown; context: unknown }) => Promise<Verdict>;
type OpenedSession = { agent: { beforeToolCall?: Hook; afterToolCall?: unknown }; abort: () => Promise<void> };

const FR_HEADING = /^### (FR-[A-Z0-9]+-\d+[a-z]?):/m;
/** The words the prompt of the step-writing task starts with, which tell its route from the feature-writing one. */
const STEP_TASK_MARKER = "You write the step definitions";
const USAGE = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

/** A valid feature file for the requirement; each round differs, so that a rewrite changes the file. */
export function validFeature(fr: string, round: number): string {
  return `@${fr}\nFeature: Feature ${fr}\n  # draft ${round}\n  Scenario: Behaviour of ${fr}\n    Given a cart\n    When it is used\n    Then it works\n`;
}

/** The scripted agent of the feature-writing step: a Pi SDK whose sessions write files into the worktree through the real sandbox hook and end with the events Pi emits for the report tool. */
export class FakeAgent {
  tasks: Task[] = [];
  refused: string[] = [];
  toolNames: string[][] = [];
  agentDirs: string[] = [];
  excludedTools: string[][] = [];
  /** Files the agent writes for a requirement, when they are not the valid feature file. */
  filesFor = new Map<string, (round: number) => AgentFile[]>();
  /** Paths the agent also tries to write, whatever the requirement. */
  attempts: string[] = [];
  /** Files the agent writes and leaves out of its report. */
  unreported: AgentFile[] = [];
  blocked: { reason: string; detail: string } | undefined;
  /** The error the provider answers every request with, instead of a turn. */
  providerError: string | undefined;
  /** The step-writing route (BDD Red): the files its agent writes through the sandbox, what it also tries to write, and what it does outside the sandbox or without reporting. */
  stepFiles: AgentFile[] = [];
  stepAttempts: string[] = [];
  stepRefused: string[] = [];
  stepTasks: string[] = [];
  stepBypass: AgentFile[] = [];
  stepUnreported: AgentFile[] = [];
  stepBlocked: { reason: string; detail: string } | undefined;
  private rounds = new Map<string, number>();

  readonly sdk = {
    DefaultResourceLoader: class {
      async reload(): Promise<void> {}
    },
    SessionManager: { create: () => ({}) },
    createAgentSession: async (options: { cwd: string; agentDir: string; tools?: string[]; excludeTools?: string[] }) => {
      this.agentDirs.push(options.agentDir);
      this.toolNames.push(options.tools ?? []);
      this.excludedTools.push(options.excludeTools ?? []);
      return { session: this.session(options.cwd) };
    },
  } as unknown as PiSdk;

  private session(cwd: string) {
    const listeners: Array<(event: unknown) => void> = [];
    const emit = (event: unknown) => listeners.forEach((listener) => listener(event));
    const session: OpenedSession & Record<string, unknown> = {
      agent: {},
      abort: async () => undefined,
      subscribe: (listener: (event: unknown) => void) => {
        listeners.push(listener);
        return () => listeners.splice(listeners.indexOf(listener), 1);
      },
      prompt: async (text: string) => {
        if (this.providerError !== undefined) {
          emit({ type: "message_end", message: { role: "assistant", usage: USAGE, content: [], stopReason: "error", errorMessage: this.providerError } });
          return;
        }
        const report = await this.work(session, cwd, text);
        emit({ type: "tool_execution_start", toolCallId: "call-1", toolName: "report", args: report });
        emit({ type: "tool_execution_end", toolCallId: "call-1", toolName: "report", result: { content: [{ type: "text", text: "Report received." }] }, isError: false });
        emit({ type: "message_end", message: { role: "assistant", usage: USAGE, content: [{ type: "text", text: "Done." }], stopReason: "stop" } });
        emit({ type: "agent_end", messages: [] });
      },
      dispose: () => undefined,
    };
    return session;
  }

  private async workSteps(session: OpenedSession, cwd: string, text: string): Promise<Report> {
    this.stepTasks.push(text);
    for (const path of this.stepAttempts) await this.write(session, cwd, { path, content: "// not allowed\n" }, this.stepRefused);
    if (this.stepBlocked !== undefined) return { status: "blocked", ...this.stepBlocked };
    for (const file of this.stepFiles) await this.write(session, cwd, file, this.stepRefused);
    for (const file of [...this.stepBypass, ...this.stepUnreported]) await createWriteTool(cwd).execute("call-write", { path: file.path, content: file.content });
    const paths = [...this.stepFiles, ...this.stepBypass].map((file) => file.path);
    return { status: "done", files: paths, summary: "Wrote the step definitions." };
  }

  private async work(session: OpenedSession, cwd: string, text: string): Promise<Report> {
    if (text.includes(STEP_TASK_MARKER)) return this.workSteps(session, cwd, text);
    const fr = FR_HEADING.exec(text)?.[1] ?? "";
    this.tasks.push({ fr, text });
    const round = (this.rounds.get(fr) ?? 0) + 1;
    this.rounds.set(fr, round);
    for (const path of this.attempts) await this.write(session, cwd, { path, content: "// not allowed\n" });
    if (this.blocked !== undefined) return { status: "blocked", ...this.blocked };
    const files = this.filesFor.get(fr)?.(round) ?? [{ path: `features/${fr}.feature`, content: validFeature(fr, round) }];
    for (const file of [...files, ...this.unreported]) await this.write(session, cwd, file);
    const paths = files.map((file) => file.path);
    return paths.length > 0 ? { status: "done", files: paths, summary: `Wrote the feature files of ${fr}.` } : { status: "done", files: [], summary: "Nothing to write.", reason: "no_unit_logic_left" };
  }

  /** Makes one write call as Pi does: the session's hook decides, and only a call it lets through writes the file. */
  private async write(session: OpenedSession, cwd: string, file: AgentFile, refused: string[] = this.refused): Promise<void> {
    const args = { path: file.path, content: file.content };
    const toolCall = { type: "toolCall", id: "call-write", name: "write", arguments: args };
    const verdict = await session.agent.beforeToolCall?.({ assistantMessage: {}, toolCall, args, context: {} });
    if (verdict?.block === true) refused.push(file.path);
    else await createWriteTool(cwd).execute("call-write", args);
  }
}
