import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as pi from "@earendil-works/pi-coding-agent";
import type { PiSdk } from "../../src/agents/runner.js";
import type { OidWorld, RunServices, TerminalInput } from "../support/world.js";

type AuthFile = Record<string, { type?: string; key?: string; access?: string }>;
type Interaction = { notify(event: { type: "auth_url"; url: string }): void; prompt(prompt: { type: "manual_code"; message: string }): Promise<string> };
type RuntimeOptions = { authPath?: string };

/** The user of a scenario: where their configuration, oid's agent directory and the Pi installation are, and the keys they were given. */
type User = { configDir: string; agentDir: string; piAgentDir: string; stdin?: string; held: Map<string, string>; terminal?: ScriptedTerminal };
const users = new WeakMap<OidWorld, User>();

function userOf(world: OidWorld): User {
  const user = users.get(world);
  assert.ok(user, "the scenario has no user: add the step \"a user who has not set up oid\"");
  return user;
}

function readAuth(path: string): AuthFile {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as AuthFile) : {};
}

function writeAuth(path: string, entries: AuthFile): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ ...readAuth(path), ...entries }, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

/** Pi's real runtime, except that the login with a provider's own flow (a browser and the network) is replaced by a scripted one: it shows an address, asks for the code and stores a login. */
function fakeLoginSdk(): PiSdk {
  const create = async (options: RuntimeOptions) => {
    const real = await pi.ModelRuntime.create(options as Parameters<typeof pi.ModelRuntime.create>[0]);
    const login = async (providerId: string, type: string, interaction: Interaction) => {
      if (type !== "oauth") return real.login(providerId, type as "api_key", interaction as never);
      interaction.notify({ type: "auth_url", url: `https://login.example.test/${providerId}` });
      const code = await interaction.prompt({ type: "manual_code", message: "Paste the code from the browser" });
      const credential = { type: "oauth", access: `access-${code}`, refresh: `refresh-${code}`, expires: Date.now() + 3_600_000 };
      writeAuth(options.authPath!, { [providerId]: credential });
      return credential;
    };
    return new Proxy(real, {
      get: (target, property) => {
        if (property === "login") return login;
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  };
  return { ModelRuntime: { create } } as unknown as PiSdk;
}

type Entry = { question: string; answer: string };

/** A terminal that answers the questions it is asked from a script, in order, and fails on a question that is not the next one. It keeps what was asked for at a hidden prompt. */
class ScriptedTerminal {
  readonly isTTY = true as const;
  readonly hidden: string[] = [];
  readonly shown: string[] = [];
  constructor(private readonly entries: Entry[]) {}

  private next(prompt: string, hidden: boolean): string {
    const entry = this.entries.shift();
    assert.ok(entry, `the terminal was asked a question the scenario does not answer: ${prompt}`);
    assert.ok(prompt.toLowerCase().includes(entry.question.toLowerCase()), `expected a question about "${entry.question}", the terminal was asked: ${prompt}`);
    (hidden ? this.hidden : this.shown).push(entry.answer);
    return entry.answer;
  }

  async choose(prompt: string, _actions: string[]): Promise<string> {
    return this.next(prompt, false);
  }

  async line(prompt: string): Promise<string> {
    return this.next(prompt, false);
  }

  async secret(prompt: string): Promise<string> {
    return this.next(prompt, true);
  }
}

function services(world: OidWorld): RunServices {
  assert.ok(world.services, "the scenario has no services");
  return world.services;
}

Given("a user who has not set up oid", function (this: OidWorld) {
  const configDir = this.path("user/config");
  const user: User = { configDir, agentDir: join(configDir, "agent"), piAgentDir: this.path("user/pi"), held: new Map() };
  users.set(this, user);
  this.services = { pid: process.pid, configDir, agentDir: user.agentDir, piAgentDir: user.piAgentDir, input: { isTTY: false }, sdk: fakeLoginSdk() };
});

Given("the standard input holds {string}", function (this: OidWorld, text: string) {
  const user = userOf(this);
  user.stdin = text;
  services(this).readStdin = async () => text;
});

Given("oid holds the API key {string} for {string}", function (this: OidWorld, key: string, provider: string) {
  const user = userOf(this);
  user.held.set(provider, key);
  writeAuth(join(user.agentDir, "auth.json"), { [provider]: { type: "api_key", key } });
});

Given("Pi holds the API key {string} for {string}", function (this: OidWorld, key: string, provider: string) {
  writeAuth(join(userOf(this).piAgentDir, "auth.json"), { [provider]: { type: "api_key", key } });
});

Given("the configuration of oid contains:", function (this: OidWorld, content: string) {
  const user = userOf(this);
  mkdirSync(user.configDir, { recursive: true });
  writeFileSync(join(user.configDir, "config.json"), `${content}\n`);
});

Given("a terminal where the user answers:", function (this: OidWorld, table: { hashes(): { question: string; answer: string }[] }) {
  const user = userOf(this);
  user.terminal = new ScriptedTerminal(table.hashes().map(({ question, answer }) => ({ question, answer })));
  services(this).input = user.terminal as unknown as TerminalInput;
});

function heldCredential(world: OidWorld, provider: string) {
  return readAuth(join(userOf(world).agentDir, "auth.json"))[provider];
}

Then("the credentials of oid hold an API key for {string}", function (this: OidWorld, provider: string) {
  const user = userOf(this);
  const credential = heldCredential(this, provider);
  assert.ok(credential, `oid holds no credential for ${provider}; stderr: ${this.stderr}`);
  assert.equal(credential.type, "api_key", `the credential for ${provider} is not an API key`);
  const expected = user.held.get(provider) ?? user.stdin ?? user.terminal?.hidden[0];
  assert.ok(typeof credential.key === "string" && credential.key.length > 0, `the credential for ${provider} has no key`);
  assert.ok(expected === undefined || credential.key === expected, `the key stored for ${provider} is not the key the user gave`);
});

Then("the credentials of oid hold a login for {string}", function (this: OidWorld, provider: string) {
  const credential = heldCredential(this, provider);
  assert.ok(credential, `oid holds no credential for ${provider}; stderr: ${this.stderr}`);
  assert.equal(credential.type, "oauth", `the credential for ${provider} is not a login`);
  assert.ok(typeof credential.access === "string" && credential.access.length > 0, `the login for ${provider} has no access token`);
});

Then("the credentials of oid hold no credential for {string}", function (this: OidWorld, provider: string) {
  assert.equal(heldCredential(this, provider), undefined, `oid holds a credential for ${provider}`);
});

Then("the credentials file is readable by the user only", function (this: OidWorld) {
  const mode = statSync(join(userOf(this).agentDir, "auth.json")).mode & 0o777;
  assert.equal(mode.toString(8), "600", "the mode of auth.json");
});

Then("nothing the command printed contains {string}", function (this: OidWorld, secret: string) {
  const user = users.get(this);
  assert.ok(!this.stdout.includes(secret), "the secret is in the standard output");
  assert.ok(!this.stderr.includes(secret), "the secret is in the error output");
  assert.ok(!(user?.terminal?.shown ?? []).includes(secret), "the secret was typed at a prompt that shows it");
});

Then("the key {string} was asked for at a prompt that does not show it", function (this: OidWorld, key: string) {
  const terminal = userOf(this).terminal;
  assert.ok(terminal, "the scenario has no terminal");
  assert.ok(terminal.hidden.includes(key), "the key was not asked for at a hidden prompt");
  assert.ok(!terminal.shown.includes(key), "the key was asked for at a prompt that shows it");
});

Then("the configuration of oid assigns these models:", function (this: OidWorld, table: { hashes(): { role: string; model: string }[] }) {
  const path = join(userOf(this).configDir, "config.json");
  assert.ok(existsSync(path), `oid wrote no configuration; stdout: ${this.stdout}; stderr: ${this.stderr}`);
  const { models } = JSON.parse(readFileSync(path, "utf8")) as { models: Record<string, string> };
  assert.deepEqual(
    Object.fromEntries(table.hashes().map(({ role }) => [role, models[role]])),
    Object.fromEntries(table.hashes().map(({ role, model }) => [role, model])),
  );
});

Then("nothing of oid's configuration was written", function (this: OidWorld) {
  assert.ok(!existsSync(userOf(this).configDir), "oid wrote its configuration directory");
});
