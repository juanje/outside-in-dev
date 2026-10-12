import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STEP_FILE, STEP_ROUNDS } from "../support/cart-files.js";
import { terminalOf } from "../support/terminal.js";
import type { OidWorld } from "../support/world.js";
import { agentOf, runWithTerminal, worktreePath } from "./run-features.steps.js";
import { findCommit } from "./run-loop.steps.js";
import { change, eventLog, transitions } from "./run.steps.js";
import { git } from "../support/run-project.js";

const GUARD_QUESTION_ACTION = "accept_guard";
const CHECKPOINT = "oid: checkpoint FR-CART-02 BDD_RED Add a line";
const ONE_SCENARIO_FEATURE = `@FR-CART-02\nFeature: Cart lines\n  Scenario: Add a line\n    Given a cart\n    When a line is added\n    Then the cart has 1 line\n`;
const PASSES_AT_ONCE = `import assert from "node:assert/strict";\nimport { Then, When } from "@cucumber/cucumber";\n\nWhen("a line is added", function () {});\n\nThen("the cart has {int} line(s)", function (count: number) {\n  assert.ok(count);\n});\n`;
const LOOP = { unit: ["unit-baseline"], typecheck: null };

type Recorded = { name: string; bdd: string; guard?: { reason: string } };
type LoggedGuard = { type: string; fr?: string; scenario?: string; reason?: string };

/** The features whose only scenario is the one a scenario of this file works with. */
const alone = new WeakSet<OidWorld>();

Given("limits.max_retries is {int}", function (this: OidWorld, retries: number) {
  change(this, (fixture) => (fixture.retries = retries));
});

Given("the feature-writing agent writes for {string} only the scenario {string}", function (this: OidWorld, id: string, scenario: string) {
  assert.equal(`${id} ${scenario}`, "FR-CART-02 Add a line");
  agentOf(this).filesFor.set(id, () => [{ path: `features/${id}.feature`, content: ONE_SCENARIO_FEATURE }]);
  alone.add(this);
});

/** Sets what the project's fake runners replay: the run of the steps for the first scenario, then what the rest of the run asks for. */
function replaying(world: OidWorld, bdd: string[], loop?: typeof LOOP): void {
  change(world, (fixture) => {
    assert.ok(fixture.cucumber, "the project does not run its scenarios with cucumber");
    fixture.cucumber.replay = bdd;
    if (loop !== undefined) fixture.cucumber.loop = loop;
  });
}

Given("the step-writing agent writes the steps of {string} so that they pass at once, with no cart code", function (this: OidWorld, scenario: string) {
  assert.equal(scenario, "Add a line");
  agentOf(this).stepRounds = [[{ path: STEP_FILE, content: PASSES_AT_ONCE }], [{ path: STEP_FILE, content: STEP_ROUNDS[1]! }]];
  if (alone.has(this)) replaying(this, ["passes-at-once"], LOOP);
  else replaying(this, ["passes-at-once", "bdd-remove-line-missing"]);
});

Given("the step-writing agent writes the steps of {string} so that they pass at once, with no cart code, and then, when it is told a note, steps that fail because the cart code does not exist yet", function (this: OidWorld, scenario: string) {
  assert.equal(scenario, "Add a line");
  agentOf(this).stepRounds = [[{ path: STEP_FILE, content: PASSES_AT_ONCE }], [{ path: STEP_FILE, content: STEP_ROUNDS[0]! }]];
  replaying(this, ["passes-at-once", "bdd-missing-implementation"]);
});

When(/^I run "([^"]+)" with a terminal where the human answers "([^"]+)" and "([^"]+)", and gives the (?:reason|note) "([^"]+)"$/, async function (this: OidWorld, commandLine: string, first: string, second: string, text: string) {
  await runWithTerminal(this, commandLine, [first, second], [() => text]);});

function guardQuestions(world: OidWorld) {
  return terminalOf(world).choices.filter((choice) => choice.actions.includes(GUARD_QUESTION_ACTION));
}

Then("the human was asked once about the scenario {string} passing before any code, with the actions {string}, {string}, {string}, {string} and {string}", function (this: OidWorld, scenario: string, first: string, second: string, third: string, fourth: string, fifth: string) {
  const actions = [first, second, third, fourth, fifth];
  const asked = guardQuestions(this);
  assert.equal(asked.length, 1, JSON.stringify(terminalOf(this).choices));
  assert.ok(asked[0]!.prompt.includes(`"${scenario}"`), asked[0]!.prompt);
  assert.deepEqual(asked[0]!.actions, actions);
});

Then("that question mentions {string} and shows the step file the step-writing agent wrote", function (this: OidWorld, text: string) {
  const [asked] = guardQuestions(this);
  assert.ok(asked, "the guard was not asked");
  assert.ok(asked.prompt.includes(text), asked.prompt);
  assert.ok(asked.prompt.includes(STEP_FILE), asked.prompt);
  assert.ok(asked.prompt.includes('When("a line is added"'), asked.prompt);
});

function progressOf(text: string): Recorded[] {
  const features = (JSON.parse(text) as { features: { id: string; scenarios?: Recorded[] }[] }).features;
  return features.find(({ id }) => id === "FR-CART-02")?.scenarios ?? [];
}

function scenarioIn(text: string, name: string): Recorded {
  const found = progressOf(text).find((scenario) => scenario.name === name);
  assert.ok(found, `${name} is not recorded`);
  return found;
}

const committedProgress = (world: OidWorld): string => {
  const commit = findCommit(world, CHECKPOINT);
  assert.ok(commit, `the worktree has no commit "${CHECKPOINT}"`);
  return git(worktreePath(world), "show", `${commit}:progress.json`);
};

const worktreeProgress = (world: OidWorld): string => readFileSync(join(worktreePath(world), "progress.json"), "utf8");

Then("in that commit progress.json records {string} as a guard with the reason {string}", function (this: OidWorld, name: string, reason: string) {
  assert.deepEqual(scenarioIn(committedProgress(this), name).guard, { reason });
});

Then("the progress file of the worktree still records {string} as a guard with the reason {string}", function (this: OidWorld, name: string, reason: string) {
  assert.deepEqual(scenarioIn(worktreeProgress(this), name).guard, { reason });
});

Then("no guard is recorded for {string}", function (this: OidWorld, name: string) {
  assert.equal(progressOf(worktreeProgress(this)).find((scenario) => scenario.name === name)?.guard, undefined);
});

Then("the event log of the run records the guard {string} accepted by the human with the reason {string}", function (this: OidWorld, scenario: string, reason: string) {
  const found = (eventLog(this) as LoggedGuard[]).find((event) => event.type === "guard_accepted");
  assert.ok(found, "no guard was accepted");
  assert.deepEqual([found.fr, found.scenario, found.reason], ["FR-CART-02", scenario, reason]);
});

Then("the run never reaches {string} for {string}", function (this: OidWorld, state: string, scenario: string) {
  assert.ok(!transitions(this).some((event) => event.to === state && (event.reason ?? "").includes(`"${scenario}"`)), JSON.stringify(transitions(this)));
});

Then("the step-writing agent was asked for {string} next", function (this: OidWorld, scenario: string) {
  const tasks = agentOf(this).stepTasks;
  assert.ok(tasks.length >= 2, `the step-writing agent was asked ${tasks.length} times`);
  assert.ok(tasks[1]!.includes(`Scenario: ${scenario}`), tasks[1]);
});

Then("the second task of the step-writing agent includes {string}", function (this: OidWorld, text: string) {
  const tasks = agentOf(this).stepTasks;
  assert.ok(tasks.length >= 2, `the step-writing agent was asked ${tasks.length} times`);
  assert.ok(tasks[1]!.includes(text), tasks[1]);
});

Then("no agent writes a unit test", function (this: OidWorld) {
  assert.deepEqual(agentOf(this).testRoute.tasks, []);
});
