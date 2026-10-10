import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { CART_CODE, STEP_FILE, STEP_ROUNDS } from "../support/cart-files.js";
import { terminalOf } from "../support/terminal.js";
import type { OidWorld } from "../support/world.js";
import { agentOf, runWithTerminal } from "./run-features.steps.js";
import { apply, codeRound, expect, filesOfCommit, planOf, writesTest } from "./run-loop.steps.js";
import { change, eventLog } from "./run.steps.js";

const STEP_IMPORTS = `import assert from "node:assert/strict";\nimport { Then, When } from "@cucumber/cucumber";\n`;
const UNDEFINED_STEP = `${STEP_IMPORTS}\nWhen("a line is added", function () {});\n`;
const STRAY_CONTENT = "// stray\n";
const ACTIONS_AFTER_ATTEMPTS = ["retry", "rewrite", "skip_scenario", "skip_fr", "abort"];

const NOT_AN_ASSERTION_STEP = `${STEP_IMPORTS}\nWhen("a line is added", function () {\n  throw new Error("the cart could not be built");\n});\n`;

type AgentStart = { type: string; state?: string; attempt?: number; model?: string; thinkingLevel?: string; reason?: string };

function agentStarts(world: OidWorld, state: string): AgentStart[] {
  return (eventLog(world) as AgentStart[]).filter((event) => event.type === "agent_start" && event.state === state);
}

/** Where the event of this type, state and attempt is in the event log, or -1. */
function positionOf(world: OidWorld, type: string, state: string, attempt: number): number {
  return (eventLog(world) as AgentStart[]).findIndex((event) => event.type === type && event.state === state && event.attempt === attempt);
}

Given(/^the project allows (\d+) retr(?:y|ies) for each state$/, function (this: OidWorld, retries: string) {
  change(this, (fixture) => (fixture.retries = Number(retries)));
});

Given("the user's setup assigns the models {string}, {string} and {string}", function (this: OidWorld, fast: string, byDefault: string, strong: string) {
  // The scratch directory of this scenario, never the user's real configuration directory.
  this.write("config/config.json", JSON.stringify({ models: { fast, default: byDefault, strong } }));
  this.services = { ...this.services!, configDir: this.path("config") };
});

Given("the project's {string} has a {string} key", function (this: OidWorld, file: string, key: string) {
  assert.equal(file, ".outside-in.json");
  assert.equal(key, "models");
  change(this, (fixture) => (fixture.models = { fast: "fake/fast", default: "fake/default", strong: "fake/strong" }));
});

Given("the step-writing agent's first attempt writes steps where one step has no definition, and also a file {string}", function (this: OidWorld, stray: string) {
  agentOf(this).stepRounds = [[{ path: STEP_FILE, content: UNDEFINED_STEP }, { path: stray, content: STRAY_CONTENT }], ...STEP_ROUNDS.map((content) => [{ path: STEP_FILE, content }])];
  const plan = planOf(this);
  plan.bdd.unshift("undefined-step");
  apply(this, plan);
});

Given("the step-writing agent's first attempt writes steps that fail with an error that is not an assertion, and its second attempt writes steps that fail because the cart code does not exist yet", function (this: OidWorld) {
  agentOf(this).stepRounds = [[{ path: STEP_FILE, content: NOT_AN_ASSERTION_STEP }], ...STEP_ROUNDS.map((content) => [{ path: STEP_FILE, content }])];
  const plan = planOf(this);
  plan.bdd.unshift("not-an-assertion");
  apply(this, plan);
});

Given("the test-writing agent writes no unit test in any attempt", function (this: OidWorld) {
  assert.equal(agentOf(this).testRoute.rounds.length, 0);
});

Given("the test-writing agent writes no unit test in its first two attempts, then writes the unit test {string}, and it fails because the cart code does not exist yet", function (this: OidWorld, name: string) {
  agentOf(this).testRoute.rounds.push({ files: [] }, { files: [] }, writesTest(name));
  expect(this, { unit: ["unit-red-missing"] });
});

Given("the coding agent's first attempt writes code that does not make the unit test pass, and also a file {string}", function (this: OidWorld, stray: string) {
  const round = codeRound("export function addLine(lines: string[], line: string): string[] {\n  return lines;\n}\n");
  agentOf(this).codeRoute.rounds.push({ files: [...round.files, { path: stray, content: STRAY_CONTENT }] });
  expect(this, { unit: ["unit-still-failing"] });
});

Given("the coding agent's second attempt writes the cart code that passes the unit test and the scenario", function (this: OidWorld) {
  agentOf(this).codeRoute.rounds.push(codeRound(CART_CODE.withCount));
  expect(this, { unit: ["unit-green"], bdd: ["bdd-add-line-green"] });
});

When("I run {string} with a terminal where the human answers {string}, {string} and {string}, and gives the note {string}", async function (this: OidWorld, commandLine: string, first: string, second: string, third: string, note: string) {
  await runWithTerminal(this, commandLine, [first, second, third], [() => note]);
});

Then(/^the event log of the run records an "agent_start" of "([A-Z_]+)" with the attempt (\d+)$/, function (this: OidWorld, state: string, attempt: string) {
  assert.ok(agentStarts(this, state).some((event) => event.attempt === Number(attempt)), JSON.stringify(agentStarts(this, state)));
});

Then(/^the event log of the run records an "attempt_rejected" of "([A-Z_]+)" with the attempt (\d+) and the reason mentioning "(.+)"$/, function (this: OidWorld, state: string, attempt: string, text: string) {
  const found = (eventLog(this) as AgentStart[]).find((event) => event.type === "attempt_rejected" && event.state === state && event.attempt === Number(attempt));
  assert.ok(found, `no "attempt_rejected" of ${state} with the attempt ${attempt} in the event log: ${JSON.stringify(eventLog(this).map((event) => (event as AgentStart).type))}`);
  assert.ok(found.reason?.includes(text), `the reason was: ${found.reason}`);
});

Then(/^the event log of the run records the "attempt_rejected" of "([A-Z_]+)" with the attempt (\d+) before the "agent_start" of "([A-Z_]+)" with the attempt (\d+)$/, function (this: OidWorld, state: string, attempt: string, next: string, nextAttempt: string) {
  const rejected = positionOf(this, "attempt_rejected", state, Number(attempt));
  const started = positionOf(this, "agent_start", next, Number(nextAttempt));
  assert.ok(rejected >= 0 && started > rejected, JSON.stringify({ rejected, started }));
});

Then(/^the event log of the run records no "agent_start" of "([A-Z_]+)" with the attempt (\d+)$/, function (this: OidWorld, state: string, attempt: string) {
  assert.ok(agentStarts(this, state).length > 0, "the state never started an agent");
  assert.ok(!agentStarts(this, state).some((event) => event.attempt === Number(attempt)), JSON.stringify(agentStarts(this, state)));
});

Then(/^the event log of the run records an "agent_start" of "([A-Z_]+)" with the attempt (\d+), the model "(.+)" and the thinking level "(.+)"$/, function (this: OidWorld, state: string, attempt: string, model: string, level: string) {
  const found = agentStarts(this, state).find((event) => event.attempt === Number(attempt));
  assert.ok(found, JSON.stringify(agentStarts(this, state)));
  assert.deepEqual([found.model, found.thinkingLevel], [model, level]);
});

Then("the sessions of the test-writing agent were opened with {string} at {string}, {string} at {string} and {string} at {string}", function (this: OidWorld, m1: string, l1: string, m2: string, l2: string, m3: string, l3: string) {
  assert.deepEqual(agentOf(this).testRoute.opened, [{ model: m1, thinkingLevel: l1 }, { model: m2, thinkingLevel: l2 }, { model: m3, thinkingLevel: l3 }]);
});

const ORDINALS = ["first", "second", "third", "fourth"];

Then(/^the (second|third|fourth) task of the (step-writing|test-writing|coding) agent includes "(.+)" and "(.+)"$/, function (this: OidWorld, ordinal: string, who: string, first: string, second: string) {
  const agent = agentOf(this);
  const tasks = who === "step-writing" ? agent.stepTasks : who === "test-writing" ? agent.testRoute.tasks : agent.codeRoute.tasks;
  const task = tasks[ORDINALS.indexOf(ordinal)];
  assert.ok(task, `the ${who} agent was asked ${tasks.length} time(s)`);
  for (const text of [first, second]) assert.ok(task.includes(text), `the ${ordinal} task does not include "${text}":\n${task}`);
});

Then("the commit {string} does not hold {string}", function (this: OidWorld, message: string, file: string) {
  assert.ok(!filesOfCommit(this, message).includes(file));
});

function attemptQuestions(world: OidWorld) {
  return terminalOf(world).choices.filter((choice) => choice.actions.includes("rewrite"));
}

Then("the human was asked once what to do with {string}, after {int} attempts of {string}, with the actions {string}, {string}, {string}, {string} and {string}", function (this: OidWorld, scenario: string, attempts: number, state: string, a1: string, a2: string, a3: string, a4: string, a5: string) {
  const actions = [a1, a2, a3, a4, a5];
  const asked = attemptQuestions(this).filter((question) => question.prompt.includes(scenario));
  assert.equal(asked.length, 1, JSON.stringify(attemptQuestions(this)));
  assert.ok(asked[0]!.prompt.includes(scenario), asked[0]!.prompt);
  assert.ok(asked[0]!.prompt.includes(`${attempts} attempts of ${state}`), asked[0]!.prompt);
  assert.deepEqual(asked[0]!.actions, actions);
  assert.deepEqual(actions, ACTIONS_AFTER_ATTEMPTS);
});

Then("the question about the attempts mentions {string}", function (this: OidWorld, text: string) {
  assert.ok(attemptQuestions(this)[0]?.prompt.includes(text), JSON.stringify(attemptQuestions(this)));
});
