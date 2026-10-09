import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { terminalOf } from "../support/terminal.js";
import type { OidWorld } from "../support/world.js";
import { agentOf } from "./run-features.steps.js";
import { expect, writesTest } from "./run-loop.steps.js";
import { change, eventLog, session } from "./run.steps.js";

const BUDGET_ACTIONS = ["extend", "abort"];
const CENT_DIGITS = 6;

type AgentStart = { type: string; state?: string; attempt?: number };

function agentStarts(world: OidWorld, state?: string): AgentStart[] {
  return (eventLog(world) as AgentStart[]).filter((event) => event.type === "agent_start" && (state === undefined || event.state === state));
}

function budgetQuestions(world: OidWorld) {
  return terminalOf(world).choices.filter((choice) => choice.actions.includes("extend"));
}

function closeTo(actual: number | undefined, expected: number): void {
  assert.equal(Number(actual?.toFixed(CENT_DIGITS)), Number(expected.toFixed(CENT_DIGITS)));
}

Given("the agents report a cost of {float} dollars and {int} tokens for each session", function (this: OidWorld, usd: number, tokens: number) {
  agentOf(this).cost = { usd, tokens };
});

Given("the project limits the cost of the run to {float} dollars", function (this: OidWorld, usd: number) {
  change(this, (fixture) => (fixture.budget = { ...fixture.budget, cost_limit_usd: usd }));
});

Given("the project limits the cost of each feature to {float} dollars", function (this: OidWorld, usd: number) {
  change(this, (fixture) => (fixture.budget = { ...fixture.budget, cost_limit_fr_usd: usd }));
});

Given("the project limits each agent session to {int} turns", function (this: OidWorld, turns: number) {
  change(this, (fixture) => (fixture.budget = { ...fixture.budget, agent_max_turns: turns }));
});

Given(/^the project limits each agent session to (\d+) seconds?$/, function (this: OidWorld, seconds: string) {
  change(this, (fixture) => (fixture.budget = { ...fixture.budget, agent_timeout_s: Number(seconds) }));
});

Given("the test-writing agent takes {int} turns before it finishes", function (this: OidWorld, turns: number) {
  agentOf(this).testRoute.turns[0] = turns;
});

Given("the test-writing agent takes {int} turns before it finishes, then writes the unit test {string}, and it fails because the cart code does not exist yet", function (this: OidWorld, turns: number, name: string) {
  agentOf(this).testRoute.turns[0] = turns;
  agentOf(this).testRoute.rounds.push(writesTest(name));
  expect(this, { unit: ["unit-red-missing"] });
});

Given("the test-writing agent does not finish in its first session", function (this: OidWorld) {
  agentOf(this).testRoute.hangsFirst = true;
});

Then("the human was asked once what to do about the budget, with the actions {string} and {string}", function (this: OidWorld, first: string, second: string) {
  const asked = budgetQuestions(this);
  assert.equal(asked.length, 1, `${JSON.stringify(terminalOf(this).choices)}\n${this.stdout}${this.stderr}`);
  assert.deepEqual(asked[0]!.actions, [first, second]);
  assert.deepEqual([first, second], BUDGET_ACTIONS);
});

function mentions(world: OidWorld, texts: string[]): void {
  const prompt = budgetQuestions(world)[0]?.prompt ?? "";
  for (const text of texts) assert.ok(prompt.includes(text), `the question does not mention "${text}": ${prompt}`);
}

Then("the question about the budget mentions {string}, {string} and {string}", function (this: OidWorld, first: string, second: string, third: string) {
  mentions(this, [first, second, third]);
});

Then("the question about the budget mentions {string} and {string}", function (this: OidWorld, first: string, second: string) {
  mentions(this, [first, second]);
});

Then("the test-writing agent was not asked", function (this: OidWorld) {
  assert.equal(agentOf(this).testRoute.tasks.length, 0);
});

Then("the test-writing agent was asked once", function (this: OidWorld) {
  assert.equal(agentOf(this).testRoute.tasks.length, 1);
});

Then("the test-writing agent was asked twice, and its second session ran the whole task", function (this: OidWorld) {
  const route = agentOf(this).testRoute;
  assert.equal(route.tasks.length, 2);
  assert.equal(route.tasks[1], route.tasks[0]);
  assert.equal(route.stopped, 1);
});

Then("the session of the test-writing agent was stopped", function (this: OidWorld) {
  assert.equal(agentOf(this).testRoute.stopped, 1);
});

Then(/^the event log of the run records no "agent_start" of "([A-Z_]+)"$/, function (this: OidWorld, state: string) {
  assert.ok(agentStarts(this).length > 0, "the run never started an agent");
  assert.deepEqual(agentStarts(this, state), []);
});

Then(/^the event log of the run records (\d+) "agent_start" of "([A-Z_]+)", both with the attempt (\d+)$/, function (this: OidWorld, count: string, state: string, attempt: string) {
  assert.deepEqual(agentStarts(this, state).map((event) => event.attempt), Array(Number(count)).fill(Number(attempt)));
});

Then("the saved session records the cost of the run as {float} dollars and {int} tokens for each agent session that the event log shows started", function (this: OidWorld, usd: number, tokens: number) {
  const started = agentStarts(this).length;
  assert.ok(started > 0, "the run never started an agent");
  closeTo(session(this).spend?.usd, usd * started);
  assert.equal(session(this).spend?.tokens, tokens * started);
});

Then("the saved session records the same cost for {string}", function (this: OidWorld, fr: string) {
  const spend = session(this).spend;
  closeTo(spend?.byFr[fr]?.usd, spend?.usd ?? NaN);
  assert.equal(spend?.byFr[fr]?.tokens, spend?.tokens);
});

Then("the saved session records the cost limit as extended once", function (this: OidWorld) {
  assert.equal(session(this).extensions, 1);
});
