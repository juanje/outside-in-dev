import { createWriteTool } from "@earendil-works/pi-coding-agent";
import type { PiSdk } from "../../src/agents/runner.js";

export type AgentFile = { path: string; content: string };
type Task = { fr: string; text: string };
/** What an agent of a unit-test step does in one of its rounds: the files it writes through the sandbox, the files it changes without the sandbox noticing, and what it reports. */
export type Round = { files: AgentFile[]; bypass?: AgentFile[]; test?: string; noUnitLogicLeft?: boolean };
/** A scripted route of the loop: the agent of one step, its rounds in order (an asked round beyond the list writes nothing), what it also tries to write and how it ends. */
export class Route {
  tasks: string[] = [];
  rounds: Round[] = [];
  attempts: string[] = [];
  refused: string[] = [];
  blocked: { reason: string; detail: string } | undefined;
  providerError: string | undefined;
  toolNames: string[][] = [];
  excludedTools: string[][] = [];
  /** The model and the thinking level each of its sessions was opened with, in order. */
  opened: { model?: string; thinkingLevel?: string }[] = [];
}
type Report = { status: "done"; files: string[]; summary: string; reason?: string; test?: string } | { status: "blocked"; reason: string; detail: string };
type Verdict = { block?: boolean } | undefined;
type Hook = (context: { assistantMessage: unknown; toolCall: unknown; args: unknown; context: unknown }) => Promise<Verdict>;
type OpenedSession = { agent: { beforeToolCall?: Hook; afterToolCall?: unknown }; abort: () => Promise<void> };

const FR_HEADING = /^### (FR-[A-Z0-9]+-\d+[a-z]?):/m;
/** The words the prompt of the step-writing task starts with, which tell its route from the feature-writing one. */
const STEP_TASK_MARKER = "You write the step definitions";
/** The words the prompts of the unit-test and the code tasks start with, which tell their routes from the others. */
const TEST_TASK_MARKER = "You write one failing unit test";
const CODE_TASK_MARKER = "You write the minimum code";
/** The words the prompt of the refactoring task starts with. */
const REFACTOR_TASK_MARKER = "You fix exactly the findings";
/** The words the prompt of a quality fix starts with, and the owner it names: the unit tests, or the source files. */
const QUALITY_FIX_MARKER = "You fix exactly the lint and type errors";
const QUALITY_FIX_TESTS = "the unit tests you own";
const QUALITY_FIX_SOURCE = "the source files you own";
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
  /** The step files of each scenario the step-writing agent is asked for, in order; beyond the list, or without it, it writes `stepFiles`. */
  stepRounds: AgentFile[][] = [];
  readonly testRoute = new Route();
  readonly codeRoute = new Route();
  readonly refactorRoute = new Route();
  private rounds = new Map<string, number>();

  readonly sdk = {
    DefaultResourceLoader: class {
      async reload(): Promise<void> {}
    },
    SessionManager: { create: () => ({}) },
    ModelRuntime: { create: async () => ({ getModel: (provider: string, id: string) => ({ provider, id }), getAvailable: async () => [] }) },
    createAgentSession: async (options: { cwd: string; agentDir: string; tools?: string[]; excludeTools?: string[]; model?: { provider: string; id: string }; thinkingLevel?: string }) => {
      this.agentDirs.push(options.agentDir);
      const tools = { names: options.tools ?? [], excluded: options.excludeTools ?? [] };
      const opened = { ...(options.model === undefined ? {} : { model: `${options.model.provider}/${options.model.id}` }), ...(options.thinkingLevel === undefined ? {} : { thinkingLevel: options.thinkingLevel }) };
      return { session: this.session(options.cwd, tools, opened) };
    },
  } as unknown as PiSdk;

  private session(cwd: string, tools: { names: string[]; excluded: string[] }, opened: { model?: string; thinkingLevel?: string }) {
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
        const route = this.unitRoute(text);
        if (route === undefined) {
          this.toolNames.push(tools.names);
          this.excludedTools.push(tools.excluded);
        } else {
          route.toolNames.push(tools.names);
          route.excludedTools.push(tools.excluded);
          route.opened.push(opened);
        }
        const providerError = route?.providerError ?? this.providerError;
        if (providerError !== undefined) {
          emit({ type: "message_end", message: { role: "assistant", usage: USAGE, content: [], stopReason: "error", errorMessage: providerError } });
          return;
        }
        const report = route === undefined ? await this.work(session, cwd, text) : await this.workRound(session, cwd, text, route);
        emit({ type: "tool_execution_start", toolCallId: "call-1", toolName: "report", args: report });
        emit({ type: "tool_execution_end", toolCallId: "call-1", toolName: "report", result: { content: [{ type: "text", text: "Report received." }] }, isError: false });
        emit({ type: "message_end", message: { role: "assistant", usage: USAGE, content: [{ type: "text", text: "Done." }], stopReason: "stop" } });
        emit({ type: "agent_end", messages: [] });
      },
      dispose: () => undefined,
    };
    return session;
  }

  private unitRoute(text: string): Route | undefined {
    if (text.includes(QUALITY_FIX_MARKER)) return text.includes(QUALITY_FIX_TESTS) ? this.testRoute : text.includes(QUALITY_FIX_SOURCE) ? this.codeRoute : undefined;
    if (text.includes(TEST_TASK_MARKER)) return this.testRoute;
    if (text.includes(REFACTOR_TASK_MARKER)) return this.refactorRoute;
    return text.includes(CODE_TASK_MARKER) ? this.codeRoute : undefined;
  }

  /** One round of a unit-test route: with no round left, the agent writes nothing and reports nothing else. */
  private async workRound(session: OpenedSession, cwd: string, text: string, route: Route): Promise<Report> {
    const round = route.rounds[route.tasks.length];
    route.tasks.push(text);
    for (const path of route.attempts) await this.write(session, cwd, { path, content: "// not allowed\n" }, route.refused);
    if (route.blocked !== undefined) return { status: "blocked", ...route.blocked };
    if (round === undefined) return { status: "done", files: [], summary: "Nothing to write." };
    for (const file of round.files) await this.write(session, cwd, file, route.refused);
    for (const file of round.bypass ?? []) await createWriteTool(cwd).execute("call-write", { path: file.path, content: file.content });
    if (round.noUnitLogicLeft === true) return { status: "done", files: [], summary: "No unit logic is left.", reason: "no_unit_logic_left" };
    const files = [...round.files, ...(round.bypass ?? [])].map((file) => file.path);
    return { status: "done", files, summary: "Wrote the files of the round.", ...(round.test === undefined ? {} : { test: round.test }) };
  }

  private async workSteps(session: OpenedSession, cwd: string, text: string): Promise<Report> {
    const round = this.stepRounds[this.stepTasks.length];
    this.stepTasks.push(text);
    for (const path of this.stepAttempts) await this.write(session, cwd, { path, content: "// not allowed\n" }, this.stepRefused);
    if (this.stepBlocked !== undefined) return { status: "blocked", ...this.stepBlocked };
    const written = round ?? this.stepFiles;
    for (const file of written) await this.write(session, cwd, file, this.stepRefused);
    for (const file of [...this.stepBypass, ...this.stepUnreported]) await createWriteTool(cwd).execute("call-write", { path: file.path, content: file.content });
    const paths = [...written, ...this.stepBypass].map((file) => file.path);
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
