import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentFile } from "../support/fake-agent.js";
import { git } from "../support/run-project.js";
import { terminalOf } from "../support/terminal.js";
import type { OidWorld } from "../support/world.js";
import { agentOf, worktreePath, worktreeText } from "./run-features.steps.js";
import { change, DEFAULT_REPLAY, session, transitions } from "./run.steps.js";

const STEP_FILE = "features/steps/cart-lines.steps.ts";
const CART_FILE = "features/steps/cart.steps.ts";
const FEATURE_FIRST_LINE = 3;

const CART_LINES_FEATURE = (id: string, first: string, second: string): string =>
  `@${id}\nFeature: Cart lines\n  Scenario: ${first}\n    Given a cart\n    When a line is added\n    Then the cart has 1 line\n\n  Scenario: ${second}\n    Given a cart with 1 line\n    When the line is removed\n    Then the cart has 0 lines\n`;

const IMPORTS = `import assert from "node:assert/strict";\nimport { Then, When } from "@cucumber/cucumber";\n`;
const MISSING_CART_STEP = `When("a line is added", async function () {\n  const { addLine } = await import("../../src/cart.js");\n  addLine();\n});\n`;
const COUNT_STEP = `Then("the cart has {int} line(s)", function (count: number) {\n  assert.equal(count, 1);\n});\n`;
const EMPTY_STEP = `When("a line is added", function () {});\n`;

/** The recorded report the BDD command replays for the gate run of the scenario, in place of the run of the steps this agent writes. */
function replaying(world: OidWorld, recording: string): void {
  change(world, (fixture) => {
    assert.ok(fixture.cucumber, "the project does not run its scenarios with cucumber");
    fixture.cucumber.replay = recording;
  });
}

function stepFile(content: string): AgentFile {
  return { path: STEP_FILE, content: `${IMPORTS}\n${content}` };
}

/** The steps of each way a scenario can be written that is not a plain missing implementation, with the recorded report of cucumber running them. */
const PROBLEMS: Record<string, { steps: string; recording: string }> = {
  "the scenario passes at once": { steps: `${EMPTY_STEP}\nThen("the cart has {int} line(s)", function (count: number) {\n  assert.ok(count);\n});\n`, recording: "passes-at-once" },
  "one step has no definition": { steps: EMPTY_STEP, recording: "undefined-step" },
};

Given("the project runs its BDD scenarios with cucumber and defines the steps of the scenario {string}", function (this: OidWorld, scenario: string) {
  change(this, (fixture) => (fixture.cucumber = { feature: "FR-CART-01", scenario, replay: DEFAULT_REPLAY }));
});

Given("progress.json records {string} as done with its passing scenario {string}, and {string} as pending", function (this: OidWorld, done: string, scenario: string, pending: string) {
  change(this, (fixture) => {
    assert.equal(fixture.cucumber?.scenario, scenario);
    fixture.tracked.set(done, "done");
    fixture.tracked.set(pending, "pending");
  });
});

Given("the feature-writing agent writes for {string} the scenarios {string} and {string}", function (this: OidWorld, id: string, first: string, second: string) {
  agentOf(this).filesFor.set(id, () => [{ path: `features/${id}.feature`, content: CART_LINES_FEATURE(id, first, second) }]);
});

Given("the step-writing agent writes the steps of the scenario it is given, and they fail because the cart code does not exist yet", function (this: OidWorld) {
  agentOf(this).stepFiles = [stepFile(`${MISSING_CART_STEP}\n${COUNT_STEP}`)];
});

Given("the step-writing agent also tries to write {string} and {string}", function (this: OidWorld, first: string, second: string) {
  agentOf(this).stepAttempts = [first, second];
});

Given("the step-writing agent also changes the step {string} so that it fails", function (this: OidWorld, step: string) {
  const content = `import { Given, Then, When } from "@cucumber/cucumber";\nGiven("a cart", function () {});\nWhen("a product is added", function () {});\nThen("${step}", function () {\n  throw new Error("the cart is empty");\n});\n`;
  agentOf(this).stepFiles.push({ path: CART_FILE, content });
  replaying(this, "regression");
});

Given(/^the step-writing agent writes steps where (.+)$/, function (this: OidWorld, problem: string) {
  const found = PROBLEMS[problem];
  assert.ok(found !== undefined, `unknown problem: ${problem}`);
  agentOf(this).stepFiles = [stepFile(found.steps)];
  replaying(this, found.recording);
});

Given("the step-writing agent writes steps that fail with an error that is not an assertion", function (this: OidWorld) {
  agentOf(this).stepFiles = [stepFile(`When("a line is added", function () {\n  throw new Error("the cart could not be built");\n});\n\n${COUNT_STEP}`)];
  replaying(this, "not-an-assertion");
});

Given("the step-writing agent writes a step file that imports {string} statically", function (this: OidWorld, specifier: string) {
  agentOf(this).stepFiles = [{ path: STEP_FILE, content: `import { addLine } from "${specifier}";\nimport { When } from "@cucumber/cucumber";\nWhen("a line is added", function () {\n  addLine();\n});\n` }];
});

Given("the step-writing agent changes {string} without the sandbox noticing", function (this: OidWorld, file: string) {
  agentOf(this).stepBypass = [{ path: file, content: "// changed\n" }];
});

Given("the step-writing agent reports that it is blocked with the reason {string}", function (this: OidWorld, detail: string) {
  agentOf(this).stepBlocked = { reason: "spec_gap", detail };
});

Given("the step-writing agent changes a file it does not report", function (this: OidWorld) {
  agentOf(this).stepUnreported = [{ path: "features/steps/extra.steps.ts", content: "// extra\n" }];
});

function firstStepTask(world: OidWorld): string {
  const [task] = agentOf(world).stepTasks;
  assert.ok(task, "the step-writing agent was not run");
  return task;
}

/** The hash of the commit of the worktree whose subject is `message`. */
function commitOf(world: OidWorld, message: string): string {
  const found = git(worktreePath(world), "log", "--format=%H\t%s").split("\n").map((line) => line.split("\t") as [string, string]).find(([, subject]) => subject === message);
  assert.ok(found, `the worktree has no commit "${message}"`);
  return found[0];
}

Then("the worktree has the commit {string} with the step definitions and the progress update", function (this: OidWorld, message: string) {
  const files = git(worktreePath(this), "show", "--name-only", "--format=", commitOf(this, message)).split("\n");
  for (const file of [STEP_FILE, "progress.json"]) assert.ok(files.includes(file), files.join(", "));
});

Then("in the commit {string} progress.json records {string} as {string} and {string} as {string}", function (this: OidWorld, message: string, first: string, firstStatus: string, second: string, secondStatus: string) {
  const progress = JSON.parse(git(worktreePath(this), "show", `${commitOf(this, message)}:progress.json`)) as { features: { scenarios?: { name: string; bdd: string }[] }[] };
  const recorded = Object.fromEntries(progress.features.flatMap((feature) => feature.scenarios ?? []).map(({ name, bdd }) => [name, bdd]));
  assert.deepEqual([recorded[first], recorded[second]], [firstStatus, secondStatus]);
});

Then("the first task of the step-writing agent includes the scenario {string} and its location {string}", function (this: OidWorld, name: string, location: string) {
  assert.ok(firstStepTask(this).includes(`Scenario: ${name}`), "no scenario");
  assert.ok(firstStepTask(this).includes(location), `no location ${location}`);
  assert.equal(location, `features/FR-CART-02.feature:${FEATURE_FIRST_LINE}`);
});

Then("the first task of the step-writing agent includes the step definitions that exist and the signature of {string} with its description", function (this: OidWorld, name: string) {
  assert.ok(firstStepTask(this).includes('Given("a cart"'), "no existing steps");
  assert.ok(firstStepTask(this).includes(`${name}(lines: string[]): number`), "no signature");
  assert.ok(firstStepTask(this).includes("Counts the lines of a cart."), "no description");
});

Then("the first task of the step-writing agent includes neither the scenario {string}, nor a unit test, nor the body of {string}", function (this: OidWorld, other: string, name: string) {
  assert.ok(firstStepTask(this).includes("Scenario: Add a line"), "the task is empty");
  for (const marker of [`Scenario: ${other}`, "cart-test-marker", "bodyMarker"]) assert.ok(!firstStepTask(this).includes(marker), `the task includes ${marker} of ${name}`);
});

Then("the step-writing agent was refused both writes", function (this: OidWorld) {
  assert.deepEqual(agentOf(this).stepRefused, agentOf(this).stepAttempts);
});

Then("the worktree has no {string}", function (this: OidWorld, file: string) {
  assert.throws(() => readFileSync(join(worktreePath(this), file)), `${file} exists`);
});

Then("the feature file of {string} is as it was approved", function (this: OidWorld, id: string) {
  const file = `features/${id}.feature`;
  const hash = `sha256:${createHash("sha256").update(worktreeText(this, file)).digest("hex")}`;
  assert.equal(session(this).featureHashes?.[file], hash);
});

Then("the run never reaches {string}", function (this: OidWorld, state: string) {
  assert.ok(!transitions(this).some((event) => event.to === state), `the run reached ${state}`);
});

function redQuestions(world: OidWorld) {
  return terminalOf(world).choices.filter((choice) => choice.actions.includes("trace"));
}

Then("the human was asked twice about the Red of {string}, with the actions {string}, {string} and {string}", function (this: OidWorld, scenario: string, first: string, second: string, third: string) {
  const asked = redQuestions(this);
  assert.equal(asked.length, 2);
  for (const question of asked) {
    assert.ok(question.prompt.includes(scenario), question.prompt);
    assert.deepEqual(question.actions, [first, second, third]);
  }
});

Then("the second question about the Red showed the whole failure, with its stack", function (this: OidWorld) {
  const [first, second] = redQuestions(this);
  assert.ok(second && first, "the Red was not asked twice");
  assert.match(second.prompt, /the cart could not be built/);
  assert.match(second.prompt, /\n\s+at /);
  assert.doesNotMatch(first.prompt, /\n\s+at /);
});
