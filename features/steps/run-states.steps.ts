import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { CART_CODE } from "../support/cart-files.js";
import type { OidWorld } from "../support/world.js";
import { CART_LINES_FEATURE } from "./run-bdd-red.steps.js";
import { agentOf, runWithTerminal } from "./run-features.steps.js";
import { TODO_CODE } from "./run-gate.steps.js";
import { codeRound } from "./run-loop.steps.js";

Given("the feature-writing agent reports that it is blocked in its first attempt with the reason {string}, then writes for {string} the scenarios {string} and {string}", function (this: OidWorld, detail: string, id: string, first: string, second: string) {
  const agent = agentOf(this);
  agent.blockedFirst = { reason: "spec_conflict", detail };
  agent.filesFor.set(id, () => [{ path: `features/${id}.feature`, content: CART_LINES_FEATURE(id, first, second) }]);
});

Given("the coding agent leaves a TODO comment in the cart code of the second scenario, and reports that it is blocked with the reason {string} when it is asked to fix the lint error", function (this: OidWorld, detail: string) {
  const { rounds } = agentOf(this).codeRoute;
  rounds[1] = codeRound(TODO_CODE);
  rounds[2] = { files: [], blocked: { reason: "spec_gap", detail } };
});

Given("the coding agent leaves a TODO comment in the cart code of the second scenario, reports that it is blocked with the reason {string} the first time it is asked to fix the lint error, and removes the comment the second time", function (this: OidWorld, detail: string) {
  const { rounds } = agentOf(this).codeRoute;
  rounds[1] = codeRound(TODO_CODE);
  rounds[2] = { files: [], blocked: { reason: "spec_gap", detail } };
  rounds[3] = codeRound(CART_CODE.withRemove);
});

When("I run {string} with a terminal where the human answers {string} and then {string}, and gives the note {string}", async function (this: OidWorld, commandLine: string, first: string, second: string, note: string) {
  await runWithTerminal(this, commandLine, [first, second], [() => note]);
});

Then("the second task of the feature-writing agent includes {string}", function (this: OidWorld, text: string) {
  const second = agentOf(this).tasks[1]?.text;
  assert.ok(second?.includes(text), `the second task does not include "${text}":\n${second}`);
});

Then("the last task of the coding agent includes {string}", function (this: OidWorld, text: string) {
  const { tasks } = agentOf(this).codeRoute;
  assert.ok(tasks.at(-1)?.includes(text), `the last task does not include "${text}":\n${tasks.at(-1)}`);
});
