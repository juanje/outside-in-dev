import { beforeEach, describe, expect, it } from "vitest";
import { runAgent } from "../../src/agents/runner.js";
import { commitAll } from "./git-fixture.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

beforeEach(() => {
  write("src/a.ts", "a\n");
  commitAll();
});

/** How long a session that hangs waits for the abort before it gives up, so that a missing abort fails the test and does not hang it. */
const HANG_CAP_MS = 300;

type Listener = (event: unknown) => void;
type Limits = NonNullable<Parameters<typeof runAgent>[1]["limits"]>;

const usage = (total: number) => ({ input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 10, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total } });
const toolTurn = (cost = 0) => ({ type: "message_end", message: { role: "assistant", stopReason: "toolUse", content: [{ type: "toolCall" }], usage: usage(cost) } });

/** A Pi session that sends `turns` assistant messages that call a tool, as long as it is not aborted, and then waits for the abort when `hangs`. */
function turningSession({ turns, hangs = false, cost = 0 }: { turns: number; hangs?: boolean; cost?: number }) {
  const listeners: Listener[] = [];
  const state = { aborts: 0, sent: 0 };
  let release = () => {};
  const waiting = new Promise<void>((resolve) => (release = resolve));
  const session = {
    subscribe: (listener: Listener) => {
      listeners.push(listener);
      return () => listeners.splice(listeners.indexOf(listener), 1);
    },
    prompt: async () => {
      for (; state.sent < turns && state.aborts === 0; state.sent += 1) listeners.forEach((listener) => listener(toolTurn(cost)));
      if (hangs) await Promise.race([waiting, new Promise((resolve) => setTimeout(resolve, HANG_CAP_MS))]);
    },
    abort: async () => {
      state.aborts += 1;
      release();
    },
    dispose: () => undefined,
  };
  return { session, state };
}

function run(session: ReturnType<typeof turningSession>["session"], limits: Limits) {
  return runAgent({ state: "CODE_GREEN", prompt: "Do the task." }, { worktree: dir, agentDir: "/oid/agent", sessionsDir: `${dir}/sessions`, openSession: async () => session, limits });
}

describe("runAgent limits", () => {
  it("aborts the session when the turn limit is reached and another call would follow, and says so", async () => {
    const { session, state } = turningSession({ turns: 5 });
    const outcome = await run(session, { maxTurns: 2 });
    expect(outcome).toEqual({ status: "limit", limit: "turns", detail: "the agent used 2 turns" });
    expect(state).toEqual({ aborts: 1, sent: 2 });
  });

  it("reports the cost of every assistant message, and aborts the session when the cost is over its limit and another call would follow", async () => {
    const { session, state } = turningSession({ turns: 5, cost: 0.25 });
    const seen: unknown[] = [];
    const outcome = await run(session, { onUsage: (spent) => (seen.push(spent), seen.length >= 2) });
    expect(seen).toEqual([{ usd: 0.25, tokens: 10 }, { usd: 0.25, tokens: 10 }]);
    expect(outcome).toEqual({ status: "limit", limit: "cost", detail: "the cost limit was reached" });
    expect(state).toEqual({ aborts: 1, sent: 2 });
  });

  it("aborts a session that is still running when its time limit passes, and says so", async () => {
    const { session, state } = turningSession({ turns: 0, hangs: true });
    const outcome = await run(session, { timeoutMs: 20 });
    expect(outcome).toEqual({ status: "limit", limit: "timeout", detail: "the session ran longer than 0.02 s" });
    expect(state.aborts).toBe(1);
  });
});
