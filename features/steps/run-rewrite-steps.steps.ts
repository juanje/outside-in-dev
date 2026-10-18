import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { CART_CODE, CART_FILE, STEP_FILE, STEP_ROUNDS } from "../support/cart-files.js";
import { git } from "../support/run-project.js";
import type { OidWorld } from "../support/world.js";
import { agentOf, worktreePath, worktreeText } from "./run-features.steps.js";
import { expect } from "./run-loop.steps.js";

const ADD_A_LINE = "Add a line";
const FAILS_WITHOUT_CODE = "bdd-missing-implementation";
const PASSES_WITH_CODE = "bdd-add-line-green";
/** The run of the gate of BDD Red for a scenario that passes. */
const PASSES_IN_FEATURE = PASSES_WITH_CODE;

/** The steps of "Add a line" written again: the first ones with a comment that tells the attempts apart. */
const rewritten = (attempt: number) => [{ path: STEP_FILE, content: `${STEP_ROUNDS[0]}\n// written again, attempt ${attempt}\n` }];

/** The step files the step-writing agent writes in the asks of the run: the steps of the scenario, the rewritten ones, and then the steps of the next scenario. */
function writesRewritten(world: OidWorld, rounds: number): void {
  agentOf(world).stepRounds = [[{ path: STEP_FILE, content: STEP_ROUNDS[0]! }], ...Array.from({ length: rounds }, (_, at) => rewritten(at + 1)), [{ path: STEP_FILE, content: STEP_ROUNDS[1]! }]];
}

Given("the step-writing agent's rewritten steps for {string} pass with the cart code and fail without it", function (this: OidWorld, scenario: string) {
  assert.equal(scenario, ADD_A_LINE);
  writesRewritten(this, 1);
  expect(this, { bdd: [PASSES_IN_FEATURE, FAILS_WITHOUT_CODE, PASSES_WITH_CODE, "bdd-remove-line-missing"] });
});

Given("the step-writing agent's rewritten steps for {string} pass with the cart code and also without it, in every attempt", function (this: OidWorld, scenario: string) {
  assert.equal(scenario, ADD_A_LINE);
  writesRewritten(this, 2);
  expect(this, { bdd: [PASSES_IN_FEATURE, PASSES_IN_FEATURE, PASSES_IN_FEATURE, PASSES_IN_FEATURE] });
});

Given("the step-writing agent's rewritten steps for {string} fail because the cart code does not exist yet", function (this: OidWorld, scenario: string) {
  assert.equal(scenario, ADD_A_LINE);
  writesRewritten(this, 1);
  expect(this, { bdd: [FAILS_WITHOUT_CODE] });
});

function secondStepTask(world: OidWorld): string {
  const task = agentOf(world).stepTasks[1];
  assert.ok(task, `the step-writing agent was asked ${agentOf(world).stepTasks.length} times`);
  return task;
}

Then("the second task of the step-writing agent includes {string}, {string} and the failure of the scenario", function (this: OidWorld, note: string, scenario: string) {
  assert.ok(secondStepTask(this).includes(note), secondStepTask(this));
  assert.ok(secondStepTask(this).includes(scenario), secondStepTask(this));
  assert.ok(secondStepTask(this).includes("countCartLines is not a function"), secondStepTask(this));
});

Then("the run's branch holds the commit {string} twice", function (this: OidWorld, subject: string) {
  const subjects = git(worktreePath(this), "log", "--format=%s").split("\n");
  assert.equal(subjects.filter((candidate) => candidate === subject).length, 2, subjects.join("\n"));
});

Then("the worktree still has {string} as the coding agent wrote it", function (this: OidWorld, file: string) {
  assert.equal(file, CART_FILE);
  assert.equal(worktreeText(this, file), CART_CODE.unitOnly);
});
