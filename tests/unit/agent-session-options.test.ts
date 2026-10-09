import { describe, expect, it } from "vitest";
import { openAgentSession } from "../../src/agents/runner.js";
import { fakePiSdk } from "./fake-pi-sdk.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

describe("openAgentSession", () => {
  it("passes oid's agent directory to the resource loader and to createAgentSession", async () => {
    const { sdk, calls } = fakePiSdk();
    await openAgentSession({ worktree: dir, agentDir: "/oid/agent", sessionsDir: `${dir}/sessions`, systemPrompt: "P" }, sdk);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.loader.agentDir).toBe("/oid/agent");
    expect(calls[0]?.session.agentDir).toBe("/oid/agent");
  });

  it("opens the session on the model and the thinking level it is given", async () => {
    const { sdk, calls } = fakePiSdk();
    await openAgentSession({ worktree: dir, agentDir: "/oid/agent", sessionsDir: `${dir}/sessions`, systemPrompt: "P", model: "prov/the-model", thinkingLevel: "high" }, sdk);
    expect(calls[0]?.session).toMatchObject({ model: { provider: "prov", id: "the-model" }, thinkingLevel: "high" });
  });

  it("turns off discovery of skills, context files, extensions, prompts and themes, and replaces the system prompt", async () => {
    const { sdk, calls } = fakePiSdk();
    await openAgentSession({ worktree: dir, agentDir: "/oid/agent", sessionsDir: `${dir}/sessions`, systemPrompt: "oid prompt" }, sdk);
    const loader = calls[0]?.loader;
    expect(loader).toMatchObject({ cwd: dir, noSkills: true, noContextFiles: true, noExtensions: true, noPromptTemplates: true, noThemes: true });
    const override = loader?.systemPromptOverride as (base: string | undefined) => string;
    expect(override("the user's prompt")).toBe("oid prompt");
  });
});
