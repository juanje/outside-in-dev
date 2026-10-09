import type { PiSdk } from "../../src/agents/runner.js";

export type FakeCall = { loader: Record<string, unknown>; session: Record<string, unknown>; manager: unknown[] };

/** A Pi SDK that records what `createAgentSession` is given and returns `makeSession()`. */
export function fakePiSdk(makeSession: () => unknown = () => ({ fake: true })): { sdk: PiSdk; calls: FakeCall[]; sessions: unknown[] } {
  const calls: FakeCall[] = [];
  const sessions: unknown[] = [];
  const sdk = {
    DefaultResourceLoader: class {
      options: Record<string, unknown>;
      constructor(options: Record<string, unknown>) {
        this.options = options;
      }
      async reload(): Promise<void> {}
    },
    SessionManager: { create: (...args: unknown[]) => ({ created: args }) },
    ModelRuntime: { create: async () => ({ getModel: (provider: string, id: string) => ({ provider, id }), getAvailable: async () => [] }) },
    createAgentSession: async (options: Record<string, unknown>) => {
      const loader = options.resourceLoader as { options: Record<string, unknown> };
      calls.push({ loader: loader.options, session: options, manager: (options.sessionManager as { created: unknown[] }).created });
      const session = makeSession();
      sessions.push(session);
      return { session };
    },
  } as unknown as PiSdk;
  return { sdk, calls, sessions };
}
