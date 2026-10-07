import { After, Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { OidWorld } from "../support/world.js";

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

