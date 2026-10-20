import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { CART_CODE, STEP_FILE, STEP_ROUNDS } from "../support/cart-files.js";
import { git } from "../support/run-project.js";
import { terminalOf } from "../support/terminal.js";
import type { OidWorld } from "../support/world.js";
import { agentOf, worktreePath } from "./run-features.steps.js";
import { codeRound, expect, writesTest } from "./run-loop.steps.js";
import { session, transitions } from "./run.steps.js";

const BLOCKED_MARKER = "the agent is blocked";

/** The questions the run put to the human about an agent that is blocked. */
function blockedQuestions(world: OidWorld) {
  return terminalOf(world).choices.filter((choice) => choice.prompt.includes(BLOCKED_MARKER));
}

Given("the coding agent reports that it is blocked in its first attempt with the reason {string}, then writes the cart code that passes the unit test and the scenario", function (this: OidWorld, detail: string) {
  agentOf(this).codeRoute.rounds.push({ files: [], blocked: { reason: "spec_gap", detail } }, codeRound(CART_CODE.withCount));
  expect(this, { unit: ["unit-green"], bdd: ["bdd-add-line-green"] });
});

Given("the coding agent reports that it is blocked by a wrong step definition with the detail {string}", function (this: OidWorld, detail: string) {
  agentOf(this).testRoute.rounds.push(writesTest("cart lines > adds a line"));
  agentOf(this).codeRoute.blocked = { reason: "wrong_step", detail };
  agentOf(this).stepRounds = [[{ path: STEP_FILE, content: STEP_ROUNDS[0]! }], [{ path: STEP_FILE, content: `${STEP_ROUNDS[0]}\n// written again\n` }]];
  expect(this, { unit: ["unit-red-missing"], bdd: ["bdd-missing-implementation"] });
});

Given("the test-writing agent writes the unit test {string}, and it fails because the cart code does not exist yet, and, after the rewrite, writes it again", function (this: OidWorld, name: string) {
  agentOf(this).testRoute.rounds.push(writesTest(name), writesTest(name));
  expect(this, { unit: ["unit-red-missing"] });
});

Given("the coding agent reports that it is blocked by a wrong unit test with the detail {string}", function (this: OidWorld, detail: string) {
  agentOf(this).codeRoute.blocked = { reason: "wrong_test", detail };
});

Then("the question about the blocked agent names the reason {string} and mentions {string}", function (this: OidWorld, reason: string, text: string) {
  const prompt = blockedQuestions(this)[0]?.prompt ?? "";
  assert.ok(prompt.includes(reason), JSON.stringify(blockedQuestions(this)));
  assert.ok(prompt.includes(text), prompt);
});

Then("the next task of the step-writing agent includes {string} and {string}", function (this: OidWorld, diagnosis: string, note: string) {
  const task = agentOf(this).stepTasks[1];
  assert.ok(task, `the step-writing agent was asked ${agentOf(this).stepTasks.length} times`);
  assert.ok(task.includes(diagnosis), `the task does not include the diagnosis "${diagnosis}"`);
  assert.ok(task.includes(note), `the task does not include the note "${note}"`);
});

Then(/^the human was asked once what to do about the blocked agent of "(.+)" at "([A-Z_]+)", with the actions (".+")$/, function (this: OidWorld, scenario: string, state: string, actions: string) {
  const asked = blockedQuestions(this);
  assert.equal(asked.length, 1, JSON.stringify(asked));
  assert.ok(asked[0]!.prompt.includes(scenario), asked[0]!.prompt);
  assert.ok(asked[0]!.prompt.includes(state), asked[0]!.prompt);
  assert.deepEqual(asked[0]!.actions, [...actions.matchAll(/"([a-z_]+)"/g)].map(([, action]) => action));
});

Then("the question about the blocked agent mentions {string}", function (this: OidWorld, text: string) {
  assert.ok(blockedQuestions(this)[0]?.prompt.includes(text), JSON.stringify(blockedQuestions(this)));
});

Then(/^the event log of the run records a transition from "([A-Z_]+)" to "([A-Z_]+)" whose reason mentions ("[^"]*"(?:, "[^"]*")* and "[^"]*")$/, function (this: OidWorld, from: string, to: string, texts: string) {
  const found = transitions(this).filter((event) => event.from === from && event.to === to);
  const wanted = [...texts.matchAll(/"([^"]*)"/g)].map(([, text]) => text!);
  assert.ok(found.some((event) => wanted.every((text) => event.reason?.includes(text))), JSON.stringify(found));
});

Then("the second task of the test-writing agent includes {string}", function (this: OidWorld, text: string) {
  const task = agentOf(this).testRoute.tasks[1];
  assert.ok(task, "the test-writing agent was asked once");
  assert.ok(task.includes(text), `the task does not include "${text}"`);
});

const nextLines = new WeakMap<OidWorld, string>();

Then('the second task of the test-writing agent has a "Next:" line that includes {string}', function (this: OidWorld, text: string) {
  const task = agentOf(this).testRoute.tasks[1];
  assert.ok(task, "the test-writing agent was asked once");
  const line = task.split("\n").find((candidate) => candidate.startsWith("Next:"));
  assert.ok(line !== undefined, `the task has no "Next:" line: ${task}`);
  nextLines.set(this, line);
  assert.ok(line.includes(text), line);
});

Then('that "Next:" line does not include {string}', function (this: OidWorld, text: string) {
  const line = nextLines.get(this);
  assert.ok(line !== undefined, 'no "Next:" line was read');
  assert.ok(!line.includes(text), line);
});

Then("the run's branch holds the commit {string} once", function (this: OidWorld, subject: string) {
  const subjects = git(worktreePath(this), "log", "--format=%s").split("\n");
  assert.equal(subjects.filter((candidate) => candidate === subject).length, 1, subjects.join("\n"));
});

Then("the saved session records the unit tests {string} and no other for the scenario {string}", function (this: OidWorld, test: string, scenario: string) {
  const recorded = (session(this) as { scenarioUnitTests?: Record<string, string[]> }).scenarioUnitTests ?? {};
  assert.deepEqual(recorded[scenario], [test]);
});
