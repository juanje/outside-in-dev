import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CART_CODE, CART_FILE, TEST_FILE, UNIT_TESTS } from "../support/cart-files.js";
import { git } from "../support/run-project.js";
import { terminalOf } from "../support/terminal.js";
import type { OidWorld } from "../support/world.js";
import { agentOf, worktreePath } from "./run-features.steps.js";
import { apply, codeRound, expect, findCommit, planOf } from "./run-loop.steps.js";
import { change, commit, runDirectory, writeIn } from "./run.steps.js";

const TODO_LINE = "// TODO: bound the cart\n";
const TYPE_ERROR_RECORDING = "typecheck-error-in-test";
const FIXED_TEST_MARKER = "// type error fixed\n";
const QUESTION_ACTIONS = ["view", "edit", "abort"];
/** The cart code of the second scenario with trailing spaces on one line. */
const UNTIDY_CODE = CART_CODE.withRemove.replace("return lines.length;", "return lines.length; ");
/** What the coding agent writes when it is asked to fix the lint error and leaves one: the report matches the files it changed, and a TODO comment is still there. */
const STILL_THERE = "// TODO: still here\n";
const TODO_CODE = `${CART_CODE.withRemove}${TODO_LINE}`;

type Baseline = { lint?: string[]; types?: string[]; traceability?: string[] };

function baselineOf(world: OidWorld): Baseline {
  return JSON.parse(readFileSync(join(runDirectory(world), "baseline.json"), "utf8")) as Baseline;
}

function textInCommit(world: OidWorld, message: string, file: string): string {
  const found = findCommit(world, message);
  assert.ok(found, `the worktree has no commit "${message}"`);
  return git(worktreePath(world), "show", `${found}:${file}`);
}

function gateQuestions(world: OidWorld): { prompt: string; actions: string[] }[] {
  return terminalOf(world).choices.filter((choice) => choice.actions.join() === QUESTION_ACTIONS.join());
}

/** The task a route got at position `at`, counted from one. */
function task(tasks: string[], at: number, who: string): string {
  const found = tasks[at - 1];
  assert.ok(found, `the ${who} agent was asked ${tasks.length} time(s), not ${at}`);
  return found;
}

Given("the project formats its source with a formatter that removes trailing spaces", function (this: OidWorld) {
  change(this, (fixture) => (fixture.tools.format = true));
});

Given("the project lints its source with a linter that reports every TODO comment", function (this: OidWorld) {
  change(this, (fixture) => (fixture.tools.lint = true));
});

Given("the coding agent leaves trailing spaces in the cart code of the second scenario", function (this: OidWorld) {
  agentOf(this).codeRoute.rounds[1] = codeRound(UNTIDY_CODE);
});

Given("{string} holds a TODO comment when the run starts", function (this: OidWorld, file: string) {
  writeIn(this, file, `export const cartSourceMarker = 1; ${TODO_LINE}`);
  commit(this);
});

Given("a feature file of the project has a scenario with no requirement tag when the run starts", function (this: OidWorld) {
  writeIn(this, "features/legacy.feature", "Feature: Legacy\n  Scenario: Untagged\n    Given a cart\n");
  commit(this);
});

Given("the coding agent leaves a TODO comment in the cart code of the second scenario, and removes it when it is asked to fix the lint error", function (this: OidWorld) {
  const { rounds } = agentOf(this).codeRoute;
  rounds[1] = codeRound(TODO_CODE);
  rounds[2] = codeRound(CART_CODE.withRemove);
});

Given("the coding agent leaves a TODO comment in the cart code of the second scenario, and leaves it when it is asked to fix the lint error", function (this: OidWorld) {
  const { rounds } = agentOf(this).codeRoute;
  rounds[1] = codeRound(TODO_CODE);
  rounds[2] = codeRound(`${TODO_CODE}${STILL_THERE}`);
});

Given("the type check finds an error in the unit test {string} after the last Code Green, and none once it is fixed", function (this: OidWorld, file: string) {
  assert.equal(file, TEST_FILE);
  const plan = planOf(this);
  plan.typecheck = [null, null, TYPE_ERROR_RECORDING];
  apply(this, plan);
});

Given("the test-writing agent fixes the unit test when it is asked to fix the type error", function (this: OidWorld) {
  agentOf(this).testRoute.rounds[2] = { files: [{ path: TEST_FILE, content: `${UNIT_TESTS["removes a line"]}${FIXED_TEST_MARKER}` }] };
});

Given("the full BDD run finds the scenario {string} of {string} failing", function (this: OidWorld, scenario: string, feature: string) {
  assert.equal(`${feature} ${scenario}`, "FR-CART-01 Add to cart");
  change(this, (fixture) => (fixture.cucumber!.suite = ["suite-red"]));
});

Given("the full unit run finds the unit test {string} failing", function (this: OidWorld, name: string) {
  assert.equal(name, "starts at zero");
  expect(this, { unit: ["unit-regression"] });
});

Given("the project has an extra check that prints {string} and fails", function (this: OidWorld, output: string) {
  change(this, (fixture) => (fixture.tools.extraCheck = output));
});

Then("the baseline of the run records no lint error, no type error and no traceability violation", function (this: OidWorld) {
  const { lint, types, traceability } = baselineOf(this);
  assert.deepEqual([lint, types, traceability], [[], [], []]);
});

Then("the baseline of the run lists the lint error {string} of {string} and one traceability violation", function (this: OidWorld, rule: string, file: string) {
  const { lint, traceability } = baselineOf(this);
  assert.equal(lint?.length, 1, JSON.stringify(lint));
  assert.ok(lint![0]!.includes(rule) && lint![0]!.includes(file), lint![0]);
  assert.equal(traceability?.length, 1, JSON.stringify(traceability));
});

Then("the worktree has the commit {string} with the cart code without trailing spaces", function (this: OidWorld, message: string) {
  assert.equal(textInCommit(this, message, CART_FILE), CART_CODE.withRemove.trimEnd());
});

Then("the worktree has the commit {string} with the cart code without the TODO comment", function (this: OidWorld, message: string) {
  assert.equal(textInCommit(this, message, CART_FILE), CART_CODE.withRemove.trimEnd());
});

Then("the worktree has the commit {string} with the fixed unit test", function (this: OidWorld, message: string) {
  assert.equal(textInCommit(this, message, TEST_FILE), `${UNIT_TESTS["removes a line"]}${FIXED_TEST_MARKER}`.trimEnd());
});

Then("the third task of the coding agent lists the lint error {string} of {string} and the file in full", function (this: OidWorld, rule: string, file: string) {
  const text = task(agentOf(this).codeRoute.tasks, 3, "coding");
  assert.ok(text.includes(`lint ${file}:`) && text.includes(rule), text);
  assert.ok(text.includes(`### ${file}`) && text.includes(TODO_LINE.trim()), "the file is not in full");
});

Then("the third task of the coding agent does not mention {string}", function (this: OidWorld, file: string) {
  const text = task(agentOf(this).codeRoute.tasks, 3, "coding");
  assert.ok(text.includes("no-todo"), "the task is empty");
  assert.ok(!text.includes(file), text);
});

Then("the third task of the test-writing agent lists the type error {string} of {string} and the file in full", function (this: OidWorld, code: string, file: string) {
  const text = task(agentOf(this).testRoute.tasks, 3, "test-writing");
  assert.ok(text.includes(`type ${file}:`) && text.includes(code), text);
  assert.ok(text.includes(`### ${file}`), "the file is not in full");
});

Then("the coding agent was asked only twice", function (this: OidWorld) {
  assert.equal(agentOf(this).codeRoute.tasks.length, 2);
});

Then("the coding agent was asked to fix the lint error once", function (this: OidWorld) {
  const { tasks } = agentOf(this).codeRoute;
  assert.equal(tasks.length, 3);
  assert.ok(task(tasks, 3, "coding").includes("no-todo"));
});

Then("no agent was asked to fix anything", function (this: OidWorld) {
  const agent = agentOf(this);
  assert.deepEqual([agent.codeRoute.tasks.length, agent.testRoute.tasks.length, agent.refactorRoute.tasks.length], [2, 2, 0]);
});

Then("the human was asked twice what to do about the quality gate, with the actions {string}, {string} and {string}", function (this: OidWorld, first: string, second: string, third: string) {
  const asked = gateQuestions(this);
  assert.equal(asked.length, 2);
  for (const question of asked) assert.deepEqual(question.actions, [first, second, third]);
});

Then("the human was asked once what to do about the quality gate, with the actions {string}, {string} and {string}", function (this: OidWorld, first: string, second: string, third: string) {
  const asked = gateQuestions(this);
  assert.equal(asked.length, 1);
  assert.deepEqual(asked[0]!.actions, [first, second, third]);
});

Then("the second question about the quality gate showed the whole output of the linter", function (this: OidWorld) {
  const [first, second] = gateQuestions(this);
  assert.ok(first && second, "the quality gate was not asked twice");
  assert.ok(second.prompt.includes('"ruleId":"no-todo"'), second.prompt);
  assert.ok(!first.prompt.includes('"ruleId"'), first.prompt);
});

Then("the question about the quality gate mentions {string}", function (this: OidWorld, text: string) {
  const [question] = gateQuestions(this);
  assert.ok(question?.prompt.includes(text), question?.prompt);
});
