import { rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAgent } from "../../src/agents/runner.js";
import { commitAll } from "./git-fixture.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

const USAGE = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

type Listener = (event: unknown) => void;

/** A Pi session that runs `act` on prompt, with the events Pi emits around it. */
function fakeSession(act: (emit: Listener) => void, ending: Record<string, unknown> = {}) {
  const listeners: Listener[] = [];
  const emit: Listener = (event) => listeners.forEach((listener) => listener(event));
  const state = { prompts: [] as string[], disposed: false, subscribers: () => listeners.length };
  const session = {
    subscribe: (listener: Listener) => {
      listeners.push(listener);
      return () => listeners.splice(listeners.indexOf(listener), 1);
    },
    prompt: async (text: string) => {
      state.prompts.push(text);
      act(emit);
      emit({ type: "message_end", message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "Working on it." }], usage: USAGE, ...ending } });
      emit({ type: "agent_end", messages: [] });
    },
    dispose: () => {
      state.disposed = true;
    },
  };
  return { session, state };
}

function callReport(emit: Listener, args: unknown): void {
  emit({ type: "tool_execution_start", toolCallId: "call-1", toolName: "report", args });
  emit({ type: "tool_execution_end", toolCallId: "call-1", toolName: "report", result: {}, isError: false });
}

function run(session: ReturnType<typeof fakeSession>["session"]) {
  return runAgent({ state: "CODE_GREEN", prompt: "Do the task." }, { worktree: dir, agentDir: "/oid/agent", sessionsDir: `${dir}/sessions`, openSession: async () => session });
}

describe("runAgent", () => {
  it("fails the attempt when the agent never calls the report tool, and ends its session", async () => {
    write("src/a.ts", "a\n");
    commitAll();
    const { session, state } = fakeSession(() => write("src/a.ts", "changed\n"));
    const outcome = await run(session);
    expect(outcome).toMatchObject({ status: "failed" });
    expect(outcome.status === "failed" && outcome.reason).toMatch(/no report/);
    expect(state.prompts).toEqual(["Do the task."]);
    expect(state.disposed).toBe(true);
    expect(state.subscribers()).toBe(0);
  });

  it("succeeds with the report when the files it names are exactly the files the agent changed, added or deleted", async () => {
    write("src/a.ts", "a\n");
    write("src/old.ts", "old\n");
    commitAll();
    const report = { status: "done", files: ["src/a.ts", "src/new.ts", "src/old.ts"], summary: "Done." };
    const { session } = fakeSession((emit) => {
      write("src/a.ts", "changed\n");
      write("src/new.ts", "new\n");
      rmSync(join(dir, "src/old.ts"));
      callReport(emit, report);
    });
    expect(await run(session)).toEqual({ status: "done", report });
  });

  it("fails the attempt when the report omits a changed file or names one that did not change, naming both", async () => {
    write("src/a.ts", "a\n");
    commitAll();
    const { session } = fakeSession((emit) => {
      write("src/a.ts", "changed\n");
      write("src/new.ts", "new\n");
      callReport(emit, { status: "done", files: ["src/a.ts", "src/invented.ts"], summary: "Done." });
    });
    const outcome = await run(session);
    expect(outcome.status).toBe("failed");
    const reason = outcome.status === "failed" ? outcome.reason : "";
    expect(reason).toContain("missing files: src/new.ts");
    expect(reason).toContain("extra files: src/invented.ts");
  });

  it("stops and asks, without a retry, when the provider rejected the key but the prompt resolved", async () => {
    const errorMessage = '401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}';
    write("src/a.ts", "a\n");
    commitAll();
    let opened = 0;
    const { session } = fakeSession(() => {}, { stopReason: "error", content: [], errorMessage });
    const outcome = await runAgent({ state: "CODE_GREEN", prompt: "Do the task." }, { worktree: dir, agentDir: "/oid/agent", sessionsDir: `${dir}/sessions`, openSession: async () => (opened += 1, session) });
    expect(outcome).toMatchObject({ status: "ask", detail: errorMessage });
    expect(opened).toBe(1);
  });

  it("retries a transient provider error in a new session after a pause of 5 seconds", async () => {
    write("src/a.ts", "a\n");
    commitAll();
    const report = { status: "done", files: ["src/a.ts"], summary: "Done." };
    const sessions = [
      fakeSession(() => {}, { stopReason: "error", content: [], errorMessage: "429 rate limit exceeded" }),
      fakeSession((emit) => {
        write("src/a.ts", "changed\n");
        callReport(emit, report);
      }),
    ];
    const pauses: number[] = [];
    const outcome = await runAgent(
      { state: "CODE_GREEN", prompt: "Do the task." },
      { worktree: dir, agentDir: "/oid/agent", sessionsDir: `${dir}/sessions`, openSession: async () => sessions.shift()!.session, backoff: { sleep: async (ms) => void pauses.push(ms) } },
    );
    expect(outcome).toEqual({ status: "done", report });
    expect(pauses).toEqual([5000]);
    expect(sessions).toHaveLength(0);
  });

  it("fails the attempt, saying the agent produced nothing, when the response is empty even if a report was called", async () => {
    write("src/a.ts", "a\n");
    commitAll();
    const { session } = fakeSession(
      (emit) => {
        write("src/a.ts", "changed\n");
        callReport(emit, { status: "done", files: ["src/a.ts"], summary: "Done." });
      },
      { content: [] },
    );
    const outcome = await run(session);
    expect(outcome).toMatchObject({ status: "failed" });
    expect(outcome.status === "failed" && outcome.reason).toMatch(/produced nothing/);
  });

  it("fails the attempt, saying the turn was aborted, when the response ended aborted", async () => {
    write("src/a.ts", "a\n");
    commitAll();
    const { session } = fakeSession(() => {}, { stopReason: "aborted", content: [], errorMessage: "Request was aborted" });
    const outcome = await run(session);
    expect(outcome).toMatchObject({ status: "failed" });
    expect(outcome.status === "failed" && outcome.reason).toMatch(/aborted/);
  });
});
