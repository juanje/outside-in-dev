import { describe, expect, it } from "vitest";
import { output, scriptedTerminal } from "./scripted-terminal.js";

const PROVIDERS = [
  { id: "keyonly", auth: { apiKey: { login: () => undefined } } },
  { id: "oauthonly", auth: { oauth: {} } },
  { id: "both", auth: { oauth: {}, apiKey: { login: () => undefined } } },
];

/** A runtime that knows `PROVIDERS` and records each login; `failing` names a provider whose login fails with that message. */
function runtime(failing?: { id: string; message: string }) {
  const logins: string[] = [];
  return {
    logins,
    getProviders: () => PROVIDERS,
    login: async (id: string, type: string) => {
      logins.push(`${id} ${type}`);
      if (failing?.id === id) throw new Error(failing.message);
    },
  };
}

describe("askProviders", () => {
  it("logs in to each provider that is named, with the one way it offers or the one the person chooses, until the answer is empty", async () => {
    const { askProviders } = await import("../../src/commands/setup-interactive.js");
    const terminal = scriptedTerminal(["keyonly", "oauthonly", "both", "key", ""]);
    const { io, text } = output();
    const fake = runtime();
    await askProviders(io, terminal, fake);
    expect(fake.logins).toEqual(["keyonly api_key", "oauthonly oauth", "both api_key"]);
    expect(text()).toContain("keyonly, oauthonly, both");
    expect(terminal.asked.filter((question) => question.includes("login or an API key"))).toHaveLength(1);
  });

  it("says why a provider cannot be logged in to, or why its login failed, and goes on asking", async () => {
    const { askProviders } = await import("../../src/commands/setup-interactive.js");
    const terminal = scriptedTerminal(["nobody", "keyonly", "oauthonly", ""]);
    const { io, text } = output();
    const fake = runtime({ id: "keyonly", message: "the browser was closed" });
    await askProviders(io, terminal, fake);
    expect(text()).toContain("nobody is not a provider with a login");
    expect(text()).toContain("the login to keyonly failed: the browser was closed");
    expect(fake.logins).toEqual(["keyonly api_key", "oauthonly oauth"]);
  });
});
