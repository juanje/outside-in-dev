import type { PiSdk } from "../../src/agents/runner.js";

/** What the fake Pi runtime of `oid setup` was asked: the options it was created with and each login. */
export type SetupCalls = { created: Record<string, unknown>[]; logins: { provider: string; type: string; prompted: string[] }[] };

/** How a provider of the fake can be logged in to: the ones named `sso-…` have a login of their own, the others an API key. */
function authOf(id: string) {
  return id.startsWith("sso-") ? { oauth: {} } : { apiKey: { login: () => undefined } };
}

/** A Pi SDK whose runtime knows the providers `providers` (with the models `models`, as `provider/id`) and logs in by asking its interaction for a secret and answering with it as an API key. */
export function fakeSetupSdk(providers: string[], models: string[] = []): { sdk: PiSdk; calls: SetupCalls } {
  const calls: SetupCalls = { created: [], logins: [] };
  const runtime = {
    getProviders: () => providers.map((id) => ({ id, name: id, auth: authOf(id) })),
    getProvider: (id: string) => (providers.includes(id) ? { id, name: id, auth: authOf(id) } : undefined),
    getModel: (provider: string, id: string) => (models.includes(`${provider}/${id}`) ? { provider, id } : undefined),
    getModels: () => models.map((name) => ({ provider: name.split("/")[0], id: name.slice(name.indexOf("/") + 1) })),
    login: async (provider: string, type: string, interaction: { prompt(prompt: { type: string; message: string }): Promise<string> }) => {
      const prompted: string[] = [];
      calls.logins.push({ provider, type, prompted });
      const key = await interaction.prompt({ type: "secret", message: `Enter ${provider} API key` });
      prompted.push(key);
      return { type: "api_key", key };
    },
  };
  const sdk = {
    ModelRuntime: {
      create: async (options: Record<string, unknown>) => {
        calls.created.push(options);
        return runtime;
      },
    },
  } as unknown as PiSdk;
  return { sdk, calls };
}
