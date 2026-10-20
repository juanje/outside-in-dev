import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CART_CODE, STEP_FILE, STEP_ROUNDS } from "../support/cart-files.js";
import { terminalOf } from "../support/terminal.js";
import type { OidWorld } from "../support/world.js";
import { agentOf, runWithTerminal } from "./run-features.steps.js";
import { apply, codeRound, expect, filesOfCommit, planOf, writesTest } from "./run-loop.steps.js";
import { change, eventLog } from "./run.steps.js";

const STEP_IMPORTS = `import assert from "node:assert/strict";\nimport { Then, When } from "@cucumber/cucumber";\n`;
const UNDEFINED_STEP = `${STEP_IMPORTS}\nWhen("a line is added", function () {});\n`;
const STRAY_CONTENT = "// stray\n";

export const NOT_AN_ASSERTION_STEP =`${STEP_IMPORTS}\nWhen("a line is added", function () {\n  throw new Error("the cart could not be built");\n});\n`;

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

/** Adds the effort of one state to the configuration that the models step wrote in this scenario's scratch directory. */
function setEffort(world: OidWorld, state: string, entry: { thinking: string; model?: string }): void {
  const file = "config/config.json";
  const config = JSON.parse(readFileSync(world.path(file), "utf8")) as Record<string, unknown>;
  world.write(file, JSON.stringify({ ...config, effort: { [state]: entry } }));
}

Given("the user's setup sets the effort of {string} to the thinking level {string} and the model {string}", function (this: OidWorld, state: string, thinking: string, model: string) {
  setEffort(this, state, { thinking, model });
});

Given("the user's setup sets the effort of {string} to the thinking level {string}", function (this: OidWorld, state: string, thinking: string) {
  setEffort(this, state, { thinking });
});

Then("the error mentions {string}, {string} and {string}", function (this: OidWorld, first: string, second: string, third: string) {
  for (const text of [first, second, third]) assert.ok(this.stderr.includes(text), this.stderr);
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

/** The steps that fail with each error, with the recorded report of cucumber running them. */
const FAILING_WITH: Record<string, { steps: string; recording: string }> = {
  "the cart could not be built": { steps: NOT_AN_ASSERTION_STEP, recording: "not-an-assertion" },
  "the cart lines could not be loaded": { steps: NOT_AN_ASSERTION_STEP.replace("the cart could not be built", "the cart lines could not be loaded"), recording: "not-an-assertion-lines" },
};

Given("the step-writing agent's first attempt writes steps that fail with the error {string}, and its second attempt writes steps that fail with the error {string}", function (this: OidWorld, first: string, second: string) {
  const attempts = [first, second].map((error) => FAILING_WITH[error]!);
  assert.ok(attempts.every(Boolean), `no recorded report for ${first} and ${second}`);
  agentOf(this).stepRounds = attempts.map(({ steps }) => [{ path: STEP_FILE, content: steps }]);
  const plan = planOf(this);
  plan.bdd.unshift(...attempts.map(({ recording }) => recording));
  apply(this, plan);
});

Given("the test-writing agent's first and second attempts each write a unit test that fails with an error that is not an assertion", function (this: OidWorld) {
  const named = writesTest("cart lines > adds a line").test;
  const attempt = () => ({ ...writesTest("cart lines > fails with an error"), test: named });
  agentOf(this).testRoute.rounds.push(attempt(), attempt());
  expect(this, { unit: ["unit-red-not-assertion", "unit-red-not-assertion"] });
});

Given("the test-writing agent writes no unit test in any attempt",function (this: OidWorld) {
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
  return terminalOf(world).choices.filter((choice) => choice.prompt.includes(" attempts of "));
}

Then(/^the human was asked once what to do with "([^"]+)", after (\d+) attempts of "([A-Z_]+)", with the actions (".+")$/, function (this: OidWorld, scenario: string, attempts: string, state: string, listed: string) {
  const actions = [...listed.matchAll(/"([a-z_]+)"/g)].map(([, action]) => action);
  const asked = attemptQuestions(this).filter((question) => question.prompt.includes(scenario) && question.prompt.includes(`${attempts} attempts of ${state}`));
  assert.equal(asked.length, 1, JSON.stringify(attemptQuestions(this)));
  assert.deepEqual(asked[0]!.actions, actions);
});

When("I run {string} with a terminal where the human answers {string}, {string}, {string} and {string}", async function (this: OidWorld, commandLine: string, first: string, second: string, third: string, fourth: string) {
  await runWithTerminal(this, commandLine, [first, second, third, fourth], []);
});

/** The questions the run put about a Red it could not classify. */
function redQuestions(world: OidWorld) {
  return terminalOf(world).choices.filter((choice) => choice.prompt.includes("oid cannot tell whether it is a valid Red"));
}

Then(/^the second question about the Red mentions "([^"]+)" and (?:"([^"]+)"|not "([^"]+)")$/, function (this: OidWorld, first: string, second: string | null, absent: string | null) {
  const asked = redQuestions(this)[1];
  assert.ok(asked, `the human was asked ${redQuestions(this).length} question(s) about a Red: ${JSON.stringify(terminalOf(this).choices)}`);
  assert.ok(asked.prompt.includes(first), `the question does not mention "${first}":\n${asked.prompt}`);
  if (second !== null) assert.ok(asked.prompt.includes(second), `the question does not mention "${second}":\n${asked.prompt}`);
  if (absent !== null) assert.ok(!asked.prompt.includes(absent), `the question mentions "${absent}":\n${asked.prompt}`);
});

Then("the question about the attempts mentions {string}",function (this: OidWorld, text: string) {
  assert.ok(attemptQuestions(this)[0]?.prompt.includes(text), JSON.stringify(attemptQuestions(this)));
});

Then("the question about the attempts of {string} mentions {string}", function (this: OidWorld, state: string, text: string) {
  const asked = attemptQuestions(this).find((question) => question.prompt.includes(` attempts of ${state}`));
  assert.ok(asked?.prompt.includes(text), JSON.stringify(attemptQuestions(this)));
});
