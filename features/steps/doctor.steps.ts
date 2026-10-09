import { After, Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PiSdk } from "../../src/agents/runner.js";
import { FakeAgent } from "../support/fake-agent.js";
import { detectorOf } from "../support/fake-detector.js";
import type { OidWorld } from "../support/world.js";

const PATHS = { source: ["src/**"], shared: [], unit_tests: [], bdd_features: ["features/**/*.feature"], bdd_steps: [], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" };
const SECRET_NAME = /KEY|TOKEN|SECRET/;

/** The environment variables a scenario changed, with the value they had (undefined: they were not set), to put them back after the scenario. */
const touched = new Map<string, string | undefined>();

function setEnvironment(name: string, value: string | undefined): void {
  if (!touched.has(name)) touched.set(name, process.env[name]);
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

After(function () {
  for (const [name, value] of touched) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  touched.clear();
});

Given("the environment holds no key for any provider", function () {
  for (const name of Object.keys(process.env).filter((candidate) => SECRET_NAME.test(candidate))) setEnvironment(name, undefined);
});

Given("the environment variable {string} holds {string}", function (name: string, value: string) {
  setEnvironment(name, value);
});

/** The files of a directory by relative path, with their content; nothing for a directory that does not exist. */
function treeOf(root: string, relative = ""): Record<string, string> {
  const here = join(root, relative);
  if (!existsSync(here)) return {};
  return Object.fromEntries(
    readdirSync(here).flatMap((name) => {
      const path = join(relative, name);
      return statSync(join(root, path)).isDirectory() ? Object.entries(treeOf(root, path)) : [[path, readFileSync(join(root, path), "utf8")]];
    }),
  );
}

const userBefore = new WeakMap<OidWorld, Record<string, string>>();

function configDirOf(world: OidWorld): string {
  assert.ok(world.services?.configDir, "the scenario has no user");
  return world.services.configDir;
}

Given("a project that configures the commands {string}, {string} and {string}", function (this: OidWorld, unit: string, bdd: string, typecheck: string) {
  const commands = { bdd, unit, typecheck, format: null, lint: null, coverage: null, extra_checks: [] };
  this.write(".outside-in.json", JSON.stringify({ version: 1, stack: "typescript", paths: PATHS, commands }));
  userBefore.set(this, treeOf(configDirOf(this)));
});

Given("the project's unit command is {string}", function (this: OidWorld, command: string) {
  const path = join(this.projectDir, ".outside-in.json");
  const config = JSON.parse(readFileSync(path, "utf8")) as { commands: Record<string, unknown> };
  config.commands.unit = command;
  writeFileSync(path, JSON.stringify(config));
});

type Answer = { stopReason: string; message: string };
type Calls = { providers: string[] };
const calls = new WeakMap<OidWorld, Calls>();

/** Pi's real catalogue and credentials, except that the minimal call to a provider is answered from a script, and recorded. */
function scriptedSdk(base: PiSdk, answers: Map<string, Answer>, record: Calls): PiSdk {
  const create = async (options: Parameters<PiSdk["ModelRuntime"]["create"]>[0]) => {
    const real = await base.ModelRuntime.create(options);
    const completeSimple = async (model: { provider: string }) => {
      record.providers.push(model.provider);
      const answer = answers.get(model.provider) ?? { stopReason: "error", message: "no answer scripted" };
      return { role: "assistant", content: [], stopReason: answer.stopReason, ...(answer.message === "" ? {} : { errorMessage: answer.message }) };
    };
    return Object.assign(Object.create(real) as object, { completeSimple });
  };
  return { ModelRuntime: { create } } as unknown as PiSdk;
}

Given("the providers answer a minimal call:", function (this: OidWorld, table: { hashes(): { provider: string; stopReason: string; message: string }[] }) {
  const answers = new Map(table.hashes().map(({ provider, stopReason, message }) => [provider, { stopReason, message: message.trim() }]));
  const record = { providers: [] };
  calls.set(this, record);
  this.services = { ...this.services!, sdk: scriptedSdk(this.services!.sdk!, answers, record) };
});

function called(world: OidWorld): string[] {
  return calls.get(world)?.providers ?? [];
}

Then("no provider was called", function (this: OidWorld) {
  assert.deepEqual(called(this), []);
});

Then("the providers called were {string} and {string}", function (this: OidWorld, first: string, second: string) {
  assert.deepEqual([...called(this)].sort(), [first, second].sort());
});

Then("each provider was called once", function (this: OidWorld) {
  assert.equal(new Set(called(this)).size, called(this).length, `a provider was called more than once: ${called(this).join(", ")}`);
});

Then("only the provider {string} was called", function (this: OidWorld, provider: string) {
  assert.deepEqual(called(this), [provider]);
});

/** The executable `t` the type check command of the run fixtures names, on the path for the scenario (the path is put back after it). */
function provideTypeCheckTool(world: OidWorld): void {
  const bin = world.path("user/bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "t"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  setEnvironment("PATH", `${bin}:${process.env.PATH ?? ""}`);
}

Given("oid checks the user's setup before it runs a scripted agent", function (this: OidWorld) {
  provideTypeCheckTool(this);
  const { configDir, agentDir, sdk } = this.services!;
  const agent = new FakeAgent();
  this.services = { sdk: agent.sdk, input: { isTTY: false }, pid: process.pid, agentDir: this.path("agent"), detect: detectorOf(this).detect, preflight: { configDir: configDir!, agentDir, sdk } };
});

function lines(world: OidWorld): string[] {
  return world.stdout.split("\n");
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function reportFor(world: OidWorld, status: string, subject: string): string | undefined {
  const pattern = new RegExp(`^${status}: ${escaped(subject)}(?=[ :(]|$)`);
  return lines(world).find((line) => pattern.test(line));
}

Then("the output reports {string} as ok", function (this: OidWorld, subject: string) {
  assert.ok(reportFor(this, "ok", subject), `no ok line for ${subject}; output:\n${this.stdout}`);
});

Then("the output reports {string} as missing, fixed by {string}", function (this: OidWorld, subject: string, fix: string) {
  const line = reportFor(this, "missing", subject);
  assert.ok(line, `no missing line for ${subject}; output:\n${this.stdout}`);
  assert.ok(line.includes(fix), `the line does not name the fix "${fix}": ${line}`);
});

Then("the output reports {string} as failed, saying {string}", function (this: OidWorld, subject: string, text: string) {
  const line = reportFor(this, "failed", subject);
  assert.ok(line, `no failed line for ${subject}; output:\n${this.stdout}`);
  assert.ok(line.includes(text), `the line does not say "${text}": ${line}`);
});

Then("the output does not report anything as missing", function (this: OidWorld) {
  assert.deepEqual(lines(this).filter((line) => /^(missing|failed):/.test(line)), []);
});

Then("the error does not mention {string}", function (this: OidWorld, text: string) {
  assert.ok(!this.stderr.includes(text), this.stderr);
});

Then("the directories of the user's setup hold only the configuration and the credentials the user made", function (this: OidWorld) {
  assert.deepEqual(treeOf(configDirOf(this)), userBefore.get(this));
});

Then("the project has no directory {string}", function (this: OidWorld, name: string) {
  assert.ok(!existsSync(join(this.projectDir || this.dir, name)), `${name} exists`);
});
