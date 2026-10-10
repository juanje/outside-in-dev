import { describe, expect, it } from "vitest";
import { openProfileSession } from "../../src/agents/profile-session.js";
import { fakePiSdk, type FakeCall } from "./fake-pi-sdk.js";
import { dir, useTempDir, writeMinimalConfig } from "./temp-project.js";

useTempDir();

type Agented = { agent: Record<string, unknown> };

function promptOf(call: FakeCall | undefined): string {
  return (call?.loader.systemPromptOverride as () => string)();
}

describe("openProfileSession", () => {
  it("opens a session with the step's tools, its system prompt and the sandbox installed", async () => {
    writeMinimalConfig();
    const request = { worktree: dir, agentDir: "/oid/agent", sessionsDir: `${dir}/sessions` };
    const { sdk, calls, sessions } = fakePiSdk(() => ({ agent: {}, abort: async () => {} }));

    await openProfileSession({ ...request, state: "CODE_GREEN" }, sdk);
    await openProfileSession({ ...request, state: "TDD_RED" }, sdk);

    expect(calls[0]?.session).toMatchObject({ tools: ["read", "grep", "find", "ls", "write", "edit", "bash", "report", "request_dependency", "try"], excludeTools: [], agentDir: "/oid/agent" });
    expect(calls[0]?.session.customTools).toMatchObject([{ name: "report" }, { name: "request_dependency" }, { name: "try" }]);
    expect(calls[1]?.session).toMatchObject({ tools: ["read", "grep", "find", "ls", "write", "edit", "report", "request_dependency", "try"], excludeTools: ["bash"] });
    for (const call of calls) expect(promptOf(call)).toContain("call the report tool");
    for (const call of calls) expect(promptOf(call)).toContain("orchestrator runs git and the tests");

    expect(promptOf(calls[0])).toContain("Check your work with the `try` tool on the test or scenario of your task, and read its answer");
    expect(promptOf(calls[0])).toContain("oid runs the full suites");
    expect(promptOf(calls[0])).not.toContain("quality gate");
    expect(promptOf(calls[1])).not.toContain("`try` tool");

    for (const session of sessions as Agented[]) expect(typeof session.agent.beforeToolCall).toBe("function");
    const hook = (sessions[1] as Agented).agent.beforeToolCall as (context: unknown) => Promise<{ block?: boolean } | undefined>;
    const call = { toolCall: { name: "write" }, args: { path: "src/app.ts" } };
    expect(await hook(call)).toMatchObject({ block: true });
  });

  it("opens the session on the model and the thinking level of the attempt", async () => {
    writeMinimalConfig();
    const { sdk, calls } = fakePiSdk(() => ({ agent: {}, abort: async () => {} }));
    await openProfileSession({ state: "TDD_RED", worktree: dir, agentDir: "/oid/agent", sessionsDir: `${dir}/sessions`, model: "prov/the-model", thinkingLevel: "high" }, sdk);
    expect(calls[0]?.session).toMatchObject({ model: { provider: "prov", id: "the-model" }, thinkingLevel: "high" });
  });
});

describe("openProfileSession dependencies", () => {
  it("offers request_dependency, in the one toolset array, to the steps that write tests or code and not to the one that writes features", async () => {
    writeMinimalConfig();
    const request = { worktree: dir, agentDir: "/oid/agent", sessionsDir: `${dir}/sessions` };
    const { sdk, calls } = fakePiSdk(() => ({ agent: {}, abort: async () => {} }));
    const states = ["FEATURE_WRITE", "BDD_RED", "TDD_RED", "CODE_GREEN", "REFACTOR", "FR_REFACTOR", "QUALITY_FIX"] as const;

    for (const state of states) await openProfileSession({ ...request, state }, sdk);

    states.forEach((state, index) => {
      const offered = state !== "FEATURE_WRITE";
      const session = calls[index]?.session;
      expect((session?.tools as string[]).includes("request_dependency"), `${state} allowlist`).toBe(offered);
      expect((session?.customTools as Array<{ name: string }>).some((tool) => tool.name === "request_dependency"), `${state} custom tools`).toBe(offered);
    });
  });
});

describe("openProfileSession reuse", () => {
  it("tells only the step that implements to search the reuse catalogue before writing new code", async () => {
    writeMinimalConfig();
    const request = { worktree: dir, agentDir: "/oid/agent", sessionsDir: `${dir}/sessions` };
    const { sdk, calls } = fakePiSdk(() => ({ agent: {}, abort: async () => {} }));

    await openProfileSession({ ...request, state: "CODE_GREEN" }, sdk);
    await openProfileSession({ ...request, state: "TDD_RED" }, sdk);

    expect(promptOf(calls[0])).toContain("search the reuse catalogue in your task before you write a new function or constant, and reuse what exists");
    expect(promptOf(calls[1])).not.toContain("reuse catalogue");
  });
});
