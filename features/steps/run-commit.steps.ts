import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CART_CODE, CART_FILE, CLEAR_FEATURE, CLEAR_STEP_ROUND, STEP_FILE, TEST_FILE } from "../support/cart-files.js";
import { git } from "../support/run-project.js";
import type { OidWorld } from "../support/world.js";
import { agentOf, worktreePath } from "./run-features.steps.js";
import { codeRound, expect, findCommit, writesTest } from "./run-loop.steps.js";
import { session } from "./run.steps.js";

const CLEAR_SCENARIO = "Clear the cart";
const featureFile = (id: string): string => `features/${id}.feature`;

type Recorded = { id: string; status: string; cycle_step?: string; scenarios?: { name: string; bdd: string }[] };

function progressAt(world: OidWorld, revision?: string): Recorded[] {
  const text = revision === undefined ? readFileSync(join(worktreePath(world), "progress.json"), "utf8") : git(worktreePath(world), "show", `${revision}:progress.json`);
  return (JSON.parse(text) as { features: Recorded[] }).features;
}

function commitNamed(world: OidWorld, message: string): string {
  const found = findCommit(world, message);
  assert.ok(found, `the worktree has no commit "${message}"`);
  return found;
}

/** The subjects of the commits on the run's branch, newest first. */
function branchSubjects(world: OidWorld): string[] {
  return git(worktreePath(world), "log", "--format=%s").split("\n");
}

function filesOf(world: OidWorld, commit: string): string[] {
  return git(worktreePath(world), "show", "--name-only", "--format=", commit).split("\n");
}

Given("the feature-writing agent writes for {string} the scenario {string}", function (this: OidWorld, id: string, scenario: string) {
  assert.equal(`${id} ${scenario}`, `FR-CART-03 ${CLEAR_SCENARIO}`);
  agentOf(this).filesFor.set(id, () => [{ path: featureFile(id), content: CLEAR_FEATURE }]);
});

Given("the step-writing agent also writes the steps of {string}, and they fail because the cart code does not exist yet", function (this: OidWorld, scenario: string) {
  assert.equal(scenario, CLEAR_SCENARIO);
  agentOf(this).stepRounds.push([{ path: STEP_FILE, content: CLEAR_STEP_ROUND }]);
  expect(this, { bdd: ["baseline-green*", "bdd-clear-missing"] });
});

Given("the agents also write for {string} a failing unit test and the cart code that passes it and the scenario", function (this: OidWorld, scenario: string) {
  assert.equal(scenario, CLEAR_SCENARIO);
  const agent = agentOf(this);
  agent.testRoute.rounds.push(writesTest("cart lines > clears the cart"));
  agent.codeRoute.rounds.push(codeRound(CART_CODE.withClear));
  // The full unit run of the quality gate of the earlier feature comes first.
  expect(this, { unit: ["unit-green", "unit-red-clear", "unit-green-clear"], bdd: ["bdd-clear-green"] });
});

Then("the run's branch has one commit since the start of the run, named {string}", function (this: OidWorld, subject: string) {
  const path = worktreePath(this);
  assert.equal(git(path, "rev-list", "--count", `${session(this).baseCommit}..HEAD`), "1");
  assert.equal(git(path, "log", "-1", "--format=%s"), subject);
});

Then("that commit holds the feature file, the step definitions, the unit test, the cart code and progress.json", function (this: OidWorld) {
  const files = filesOf(this, "HEAD");
  for (const file of [featureFile("FR-CART-02"), STEP_FILE, TEST_FILE, CART_FILE, "progress.json"]) assert.ok(files.includes(file), `${file} is not in ${files.join(", ")}`);
});

Then("the body of that commit lists the scenarios {string} and {string}, one per line", function (this: OidWorld, first: string, second: string) {
  assert.deepEqual(git(worktreePath(this), "log", "-1", "--format=%b").split("\n"), [`- ${first}`, `- ${second}`]);
});

Then("the run's branch no longer holds the commit {string}", function (this: OidWorld, message: string) {
  assert.ok(findCommit(this, message), `the run never made the commit "${message}"`);
  assert.ok(!branchSubjects(this).includes(message), `the branch still holds "${message}"`);
});

Then("in the commit {string} progress.json records {string} as done, with {string} as {string} and {string} as {string}", function (this: OidWorld, message: string, id: string, first: string, firstStatus: string, second: string, secondStatus: string) {
  const feature = progressAt(this, commitNamed(this, message)).find((candidate) => candidate.id === id);
  assert.deepEqual([feature?.status, feature?.cycle_step], ["done", undefined]);
  const recorded = Object.fromEntries((feature?.scenarios ?? []).map(({ name, bdd }) => [name, bdd]));
  assert.deepEqual([recorded[first], recorded[second]], [firstStatus, secondStatus]);
});

Then("{string} is done in the progress file of the worktree", function (this: OidWorld, id: string) {
  assert.equal(progressAt(this).find((candidate) => candidate.id === id)?.status, "done");
});

Then("the run's branch has the commits {string} and {string}, in that order", function (this: OidWorld, first: string, second: string) {
  const subjects = branchSubjects(this).reverse();
  assert.ok(subjects.includes(first) && subjects.includes(second), subjects.join("\n"));
  assert.ok(subjects.indexOf(first) < subjects.indexOf(second), subjects.join("\n"));
});

Then("the commit {string} does not hold the feature file of {string}", function (this: OidWorld, message: string, id: string) {
  assert.ok(!filesOf(this, commitNamed(this, message)).includes(featureFile(id)));
});

Then("the commit {string} holds the feature file of {string}", function (this: OidWorld, message: string, id: string) {
  assert.ok(filesOf(this, commitNamed(this, message)).includes(featureFile(id)));
});
