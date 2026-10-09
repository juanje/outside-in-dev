import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scriptedTerminal } from "./scripted-terminal.js";
import { setup } from "./setup-fixture.js";
import { useTempDir, write } from "./temp-project.js";

useTempDir();

const KEY = "sk-typed-secretly-9";

describe("oid setup --provider P --login at a terminal", () => {
  it("logs in to the provider with its own login, or with an API key when it has none, and asks no other question", async () => {
    const terminal = scriptedTerminal(["code-1", KEY]);
    const { fakeSetupSdk } = await import("./fake-setup-sdk.js");
    const { sdk, calls } = fakeSetupSdk(["sso-acme", "anthropic"]);
    expect((await setup(["--provider", "sso-acme", "--login"], { input: terminal, sdk })).exitCode).toBe(0);
    expect((await setup(["--provider", "anthropic", "--login"], { input: terminal, sdk })).exitCode).toBe(0);
    expect(calls.logins.map(({ provider, type }) => `${provider} ${type}`)).toEqual(["sso-acme oauth", "anthropic api_key"]);
    expect(terminal.asked).toHaveLength(2);
  });
});

describe("oid setup at a terminal with no options", () => {
  it("logs in to the providers the person names, asks for the models of the roles and keeps what it was not told to change", async () => {
    write("config/config.json", JSON.stringify({ models: { fast: "anthropic/claude-haiku-4-5", default: "anthropic/claude-sonnet-4-5", strong: "anthropic/claude-opus-5" } }));
    const terminal = scriptedTerminal(["anthropic", KEY, "", "", "anthropic/claude-opus-5", "", ""]);
    const { exitCode, stdout, stderr, calls, configDir } = await setup([], { input: terminal });
    expect(exitCode).toBe(0);
    expect(calls.logins).toEqual([{ provider: "anthropic", type: "api_key", prompted: [KEY] }]);
    expect(terminal.hidden).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(configDir, "config.json"), "utf8")).models).toEqual({ fast: "anthropic/claude-haiku-4-5", default: "anthropic/claude-opus-5", strong: "anthropic/claude-opus-5" });
    expect((stdout + stderr).includes(KEY)).toBe(false);
  });
});
