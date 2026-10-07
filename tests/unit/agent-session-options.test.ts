import { describe, expect, it } from "vitest";
import { openAgentSession, type PiSdk } from "../../src/agents/runner.js";
import { dir, useTempDir } from "./temp-project.js";

type Call = { loader: Record<string, unknown>; session: Record<string, unknown>; manager: unknown[] };

function fakeSdk(): { sdk: PiSdk; calls: Call[] } {
  const calls: Call[] = [];
  const sdk = {
    DefaultResourceLoader: class {
      options: Record<string, unknown>;
      constructor(options: Record<string, unknown>) {
        this.options = options;
      }
      async reload(): Promise<void> {}
    },
    SessionManager: { create: (...args: unknown[]) => ({ created: args }) },
    createAgentSession: async (options: Record<string, unknown>) => {
      const loader = options.resourceLoader as { options: Record<string, unknown> };
      calls.push({ loader: loader.options, session: options, manager: (options.sessionManager as { created: unknown[] }).created });
      return { session: { fake: true } };
    },
  } as unknown as PiSdk;
  return { sdk, calls };
}

useTempDir();

describe("openAgentSession", () => {
  it("passes oid's agent directory to the resource loader and to createAgentSession", async () => {
    const { sdk, calls } = fakeSdk();
    await openAgentSession({ worktree: dir, agentDir: "/oid/agent", sessionsDir: `${dir}/sessions`, systemPrompt: "P" }, sdk);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.loader.agentDir).toBe("/oid/agent");
    expect(calls[0]?.session.agentDir).toBe("/oid/agent");
  });

  it("turns off discovery of skills, context files, extensions, prompts and themes, and replaces the system prompt", async () => {
    const { sdk, calls } = fakeSdk();
    await openAgentSession({ worktree: dir, agentDir: "/oid/agent", sessionsDir: `${dir}/sessions`, systemPrompt: "oid prompt" }, sdk);
    const loader = calls[0]?.loader;
    expect(loader).toMatchObject({ cwd: dir, noSkills: true, noContextFiles: true, noExtensions: true, noPromptTemplates: true, noThemes: true });
    const override = loader?.systemPromptOverride as (base: string | undefined) => string;
    expect(override("the user's prompt")).toBe("oid prompt");
  });
});
