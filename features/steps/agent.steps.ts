import { After, Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { OidWorld } from "../support/world.js";

import type { CycleState } from "../../src/agents/profiles.js";
type AgentSession = Awaited<ReturnType<typeof import("../../src/agents/runner.js").openAgentSession>>;
type AgentScenario = {
  home: string;
  project: string;
  sessionsDir: string;
  env: Record<string, string>;
  sessions: AgentSession[];
  originalHome: string | undefined;
};

const OID_PROMPT = "You are an oid agent. Do only the task you are given.";
const USER_SETTINGS = { defaultProvider: "anthropic", defaultModel: "claude-opus-4-5", defaultThinkingLevel: "high" };
const PERSONAL_SKILL = "PERSONAL-SKILL-MARK";
const PERSONAL_CONTEXT = "PERSONAL-CONTEXT-MARK";
const PROJECT_CONTEXT = "PROJECT-CONTEXT-MARK";

const scenarios = new WeakMap<OidWorld, AgentScenario>();

function scenarioOf(world: OidWorld): AgentScenario {
  const found = scenarios.get(world);
  assert.ok(found, "no user was set up");
  return found;
}

function put(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function lastSession(world: OidWorld): AgentSession {
  const session = scenarioOf(world).sessions.at(-1);
  assert.ok(session, "no agent session was opened");
  return session;
}

Given("a user whose personal Pi directory holds settings, a skill and a context file", function (this: OidWorld) {
  const home = this.path("home");
  const personal = join(home, ".pi", "agent");
  put(join(personal, "settings.json"), JSON.stringify(USER_SETTINGS));
  put(join(personal, "skills", "mine", "SKILL.md"), `---\nname: mine\ndescription: ${PERSONAL_SKILL}\n---\nSteps.\n`);
  put(join(personal, "AGENTS.md"), `${PERSONAL_CONTEXT}\n`);
  const originalHome = process.env.HOME;
  process.env.HOME = home;
  scenarios.set(this, { home, project: this.path("project"), sessionsDir: this.path("runs/run-1/sessions"), env: { HOME: home }, sessions: [], originalHome });
});

After(function (this: OidWorld) {
  const scenario = scenarios.get(this);
  if (scenario === undefined) return;
  if (scenario.originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = scenario.originalHome;
});

Given("a project with its own context file {string}", function (this: OidWorld, name: string) {
  put(join(scenarioOf(this).project, name), `${PROJECT_CONTEXT}\n`);
});

Given("oid's own agent directory {string} under the user's home holds the thinking level {string}", function (this: OidWorld, dir: string, level: string) {
  put(join(scenarioOf(this).home, dir, "settings.json"), JSON.stringify({ defaultThinkingLevel: level }));
});

Given("oid's agent directory is set to a custom directory holding the thinking level {string}", function (this: OidWorld, level: string) {
  const scenario = scenarioOf(this);
  const custom = this.path("custom-agent");
  put(join(custom, "settings.json"), JSON.stringify({ defaultThinkingLevel: level }));
  scenario.env.OID_AGENT_DIR = custom;
});

Given("the run's sessions directory does not exist yet", function (this: OidWorld) {
  assert.equal(existsSync(scenarioOf(this).sessionsDir), false);
});

async function openTaskSession(world: OidWorld): Promise<AgentSession> {
  const { oidAgentDir, openAgentSession } = await import("../../src/agents/runner.js");
  const scenario = scenarioOf(world);
  const session = await openAgentSession({
    worktree: scenario.project,
    agentDir: oidAgentDir(scenario.env),
    sessionsDir: scenario.sessionsDir,
    systemPrompt: OID_PROMPT,
  });
  scenario.sessions.push(session);
  return session;
}

When("oid opens an agent session for a task", async function (this: OidWorld) {
  await openTaskSession(this);
});

Given("oid opened an agent session for a task and its transcript received the message {string}", async function (this: OidWorld, text: string) {
  const session = await openTaskSession(this);
  session.sessionManager.appendMessage({ role: "user", content: text, timestamp: Date.now() });
});

When("oid opens an agent session for another task", async function (this: OidWorld) {
  await openTaskSession(this);
});

Then("the session's default provider, model and thinking level are not the user's", function (this: OidWorld) {
  const settings = lastSession(this).settingsManager;
  assert.notEqual(settings.getDefaultProvider(), USER_SETTINGS.defaultProvider);
  assert.notEqual(settings.getDefaultModel(), USER_SETTINGS.defaultModel);
  assert.notEqual(settings.getDefaultThinkingLevel(), USER_SETTINGS.defaultThinkingLevel);
});

Then("the session's system prompt is exactly oid's own prompt followed by the working directory", function (this: OidWorld) {
  assert.equal(lastSession(this).systemPrompt, `${OID_PROMPT}\n\n<cwd>\n${scenarioOf(this).project}\n</cwd>`);
});

Then("the system prompt does not mention the personal skill, the personal context file or the project's context file", function (this: OidWorld) {
  const prompt = lastSession(this).systemPrompt;
  for (const mark of [PERSONAL_SKILL, PERSONAL_CONTEXT, PROJECT_CONTEXT]) assert.ok(!prompt.includes(mark), `the system prompt mentions ${mark}`);
});

Then("the session's default thinking level is {string}", function (this: OidWorld, level: string) {
  assert.equal(lastSession(this).settingsManager.getDefaultThinkingLevel(), level);
});

Then("the second session has a different transcript file from the first", function (this: OidWorld) {
  const [first, second] = scenarioOf(this).sessions;
  assert.ok(first && second, "two sessions were expected");
  assert.notEqual(second.sessionManager.getSessionFile(), first.sessionManager.getSessionFile());
});

Then("the second session's transcript does not contain {string}", function (this: OidWorld, text: string) {
  const second = scenarioOf(this).sessions[1];
  assert.ok(second, "two sessions were expected");
  assert.ok(!JSON.stringify(second.sessionManager.getEntries()).includes(text), `the second session holds "${text}"`);
});

Then("the run's sessions directory exists", function (this: OidWorld) {
  assert.ok(existsSync(scenarioOf(this).sessionsDir));
});

Then("the session's transcript file is inside it", function (this: OidWorld) {
  const file = lastSession(this).sessionManager.getSessionFile();
  assert.ok(file?.startsWith(`${scenarioOf(this).sessionsDir}/`), `transcript file ${file}`);
});


type Verdict = { block?: boolean; reason?: string } | undefined;
type SandboxScenario = { project: string; session?: AgentSession; verdict: Verdict; aborts: number; home: string };

const sandboxes = new WeakMap<OidWorld, SandboxScenario>();

const PROJECT_CONFIG = {
  version: 1,
  stack: "typescript",
  paths: {
    source: ["src/**/*.ts"],
    shared: [],
    unit_tests: ["tests/unit/**/*.test.ts"],
    bdd_features: ["features/**/*.feature"],
    bdd_steps: ["features/steps/**/*.ts", "features/support/**/*.ts"],
    docs: ["README.md", "docs/**/*.md"],
    spec: "SPEC.md",
    design: ["SPEC.md", "DOMAIN.md"],
    progress: "progress.json",
  },
  commands: { bdd: "npx cucumber-js", unit: "npx vitest run", typecheck: "npx tsc --noEmit", format: null, lint: null, coverage: null, extra_checks: [] },
};

function sandboxOf(world: OidWorld): SandboxScenario {
  const found = sandboxes.get(world);
  assert.ok(found, "no sandbox project was set up");
  return found;
}

function sandboxSession(world: OidWorld): AgentSession {
  const { session } = sandboxOf(world);
  assert.ok(session, "no agent session was opened");
  return session;
}

function sandboxHook(world: OidWorld) {
  const hook = sandboxSession(world).agent.beforeToolCall;
  assert.ok(hook, "the session has no tool call hook");
  return hook;
}

async function callTool(world: OidWorld, name: string, args: Record<string, string>): Promise<void> {
  const call = { type: "toolCall" as const, id: "call-1", name, arguments: args };
  sandboxOf(world).verdict = await sandboxHook(world)({ assistantMessage: {} as never, toolCall: call, args, context: {} as never });
}

Given("a git project with source, unit tests, features, {string} and {string}", function (this: OidWorld, progress: string, state: string) {
  const project = this.path("sandbox-project");
  put(join(project, ".outside-in.json"), JSON.stringify(PROJECT_CONFIG));
  put(join(project, progress), "{}\n");
  put(join(project, state, "state.json"), "{}\n");
  put(join(project, "package.json"), "{}\n");
  put(join(project, "src/cart.ts"), "export const cart = 1;\n");
  put(join(project, "tests/unit/cart.test.ts"), "// test\n");
  put(join(project, "features/cart.feature"), "Feature: Cart\n");
  put(this.path("outside.txt"), "outside\n");
  mkdirSync(this.path("outside-dir"), { recursive: true });
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", ...args], { cwd: project });
  git("init", "--quiet");
  git("add", "-A");
  git("commit", "--quiet", "--message", "fixture");
  sandboxes.set(this, { project, verdict: undefined, aborts: 0, home: this.path("sandbox-home") });
});

Given("the project holds the symlink {string} to {string}", function (this: OidWorld, link: string, target: string) {
  symlinkSync(target, join(sandboxOf(this).project, link));
});

Given("the project holds the symlink {string} to the directory outside the project", function (this: OidWorld, link: string) {
  symlinkSync(this.path("outside-dir"), join(sandboxOf(this).project, link));
});

Given("oid opened an agent session for the step {word}", async function (this: OidWorld, step: string) {
  const { oidAgentDir } = await import("../../src/agents/runner.js");
  const { openProfileSession } = await import("../../src/agents/profile-session.js");
  const scenario = sandboxOf(this);
  const session = await openProfileSession({
    state: step as CycleState,
    worktree: scenario.project,
    agentDir: oidAgentDir({ HOME: scenario.home }),
    sessionsDir: this.path("sandbox-runs/sessions"),
  });
  session.abort = async () => {
    scenario.aborts += 1;
  };
  scenario.session = session;
});

When("the agent calls {string} on {string}", async function (this: OidWorld, tool: string, path: string) {
  await callTool(this, tool, { path });
});

When("the agent calls {string} without a path", async function (this: OidWorld, tool: string) {
  await callTool(this, tool, { pattern: "x" });
});

When(/^the agent runs the shell command: (.*)$/, async function (this: OidWorld, command: string) {
  await callTool(this, "bash", { command });
});

When("the agent makes {int} blocked calls", async function (this: OidWorld, count: number) {
  for (let i = 0; i < count; i++) await callTool(this, "write", { path: "src/cart.ts" });
});

Then("the call is allowed", function (this: OidWorld) {
  const { verdict } = sandboxOf(this);
  assert.notEqual(verdict?.block, true, `blocked: ${verdict?.reason}`);
});

Then("the call is blocked", function (this: OidWorld) {
  assert.equal(sandboxOf(this).verdict?.block, true, "the call was allowed");
});

function assertReasonMentions(world: OidWorld, text: string): void {
  const reason = sandboxOf(world).verdict?.reason ?? "";
  assert.ok(reason.includes(text), `the reason does not mention ${text}: ${reason}`);
}

Then("the reason names the writable paths {string}", function (this: OidWorld, glob: string) {
  assertReasonMentions(this, `You may write: ${glob}`);
});

Then("the reason names the readable paths {string}", function (this: OidWorld, glob: string) {
  assertReasonMentions(this, glob);
  assertReasonMentions(this, "You may read:");
});

Then("the reason names the allowed commands {string}", function (this: OidWorld, command: string) {
  assertReasonMentions(this, command);
});

Then("the reason says the step has no shell", function (this: OidWorld) {
  assertReasonMentions(this, "no shell");
});

Then("the reason says git stays with the orchestrator", function (this: OidWorld) {
  assertReasonMentions(this, "git stays with the orchestrator");
});

Then("the session offers a shell: {word}", function (this: OidWorld, shell: string) {
  assert.equal(sandboxSession(this).getActiveToolNames().includes("bash"), shell === "yes");
});

Then("the session offers the tools: {}", function (this: OidWorld, tools: string) {
  assert.deepEqual([...sandboxSession(this).getActiveToolNames()].sort(), tools.split(", ").sort());
});

Then("the session was not aborted", function (this: OidWorld) {
  assert.equal(sandboxOf(this).aborts, 0);
});

Then("the session was aborted", function (this: OidWorld) {
  assert.ok(sandboxOf(this).aborts > 0, "the session was not aborted");
});

Then("the session's tool call hook is oid's sandbox", function (this: OidWorld) {
  assert.equal(typeof sandboxHook(this), "function");
});

Then("a forbidden call made through that hook is blocked", async function (this: OidWorld) {
  await callTool(this, "write", { path: "src/cart.ts" });
  assert.equal(sandboxOf(this).verdict?.block, true);
});
