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

    expect(calls[0]?.session).toMatchObject({ tools: ["read", "grep", "find", "ls", "write", "edit", "bash", "report"], excludeTools: [], agentDir: "/oid/agent" });
    expect(calls[0]?.session.customTools).toMatchObject([{ name: "report" }]);
    expect(calls[1]?.session).toMatchObject({ tools: ["read", "grep", "find", "ls", "write", "edit", "report"], excludeTools: ["bash"] });
    for (const call of calls) expect(promptOf(call)).toContain("call the report tool");
    for (const call of calls) expect(promptOf(call)).toContain("orchestrator runs git and the tests");

    expect(promptOf(calls[0])).toContain("quality gate");
    expect(promptOf(calls[0])).toContain("read its output");
    for (const command of ["u", "b", "t"]) expect(promptOf(calls[0])).toContain(command);
    expect(promptOf(calls[1])).not.toContain("quality gate");

    for (const session of sessions as Agented[]) expect(typeof session.agent.beforeToolCall).toBe("function");
    const hook = (sessions[1] as Agented).agent.beforeToolCall as (context: unknown) => Promise<{ block?: boolean } | undefined>;
    const call = { toolCall: { name: "write" }, args: { path: "src/app.ts" } };
    expect(await hook(call)).toMatchObject({ block: true });
  });
});
