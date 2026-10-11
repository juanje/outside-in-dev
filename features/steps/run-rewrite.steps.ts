import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { CART_CODE } from "../support/cart-files.js";
import { git } from "../support/run-project.js";
import { terminalOf } from "../support/terminal.js";
import type { OidWorld } from "../support/world.js";
import { agentOf, worktreePath } from "./run-features.steps.js";
import { codeRound, expect } from "./run-loop.steps.js";
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
  assert.ok(task.includes(text), task);
});

Then("the run's branch holds the commit {string} once", function (this: OidWorld, subject: string) {
  const subjects = git(worktreePath(this), "log", "--format=%s").split("\n");
  assert.equal(subjects.filter((candidate) => candidate === subject).length, 1, subjects.join("\n"));
});

Then("the saved session records the unit tests {string} and no other for the scenario {string}", function (this: OidWorld, test: string, scenario: string) {
  const recorded = (session(this) as { scenarioUnitTests?: Record<string, string[]> }).scenarioUnitTests ?? {};
  assert.deepEqual(recorded[scenario], [test]);
});
