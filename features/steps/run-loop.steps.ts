import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CART_CODE, CART_FILE, STEP_FILE, STEP_ROUNDS, TEST_FILE, UNIT_TESTS } from "../support/cart-files.js";
import type { Round, Route } from "../support/fake-agent.js";
import { git } from "../support/run-project.js";
import { terminalOf } from "../support/terminal.js";
import type { OidWorld } from "../support/world.js";
import { agentOf, worktreePath, worktreeText } from "./run-features.steps.js";
import { change, session, transitions } from "./run.steps.js";

const MISSING_IMPLEMENTATION = "bdd-missing-implementation";
const BLOCKED_PATTERN = /^reports that it is blocked with the reason "(.+)"$/;
const SCENARIO_FIRST_LINE = "features/FR-CART-02.feature:3";

/** The recordings the fake runners of the project replay, in the order the run asks for them. */
export type Plan = { unit: string[]; bdd: string[]; typecheck: string | null | (string | null)[] };
const plans = new WeakMap<OidWorld, Plan>();

export function planOf(world: OidWorld): Plan {
  const found = plans.get(world);
  assert.ok(found, "the step-writing agent was not set up");
  return found;
}

/** Writes the plan into the project, so that its fake runners replay it. */
export function apply(world: OidWorld, plan: Plan): void {
  change(world, (fixture) => {
    assert.ok(fixture.cucumber, "the project does not run its scenarios with cucumber");
    fixture.cucumber.replay = plan.bdd;
    fixture.cucumber.loop = { unit: plan.unit, typecheck: plan.typecheck };
  });
}

/** Adds to the plan, then applies it. */
export function expect(world: OidWorld, added: { unit?: string[]; bdd?: string[]; typecheck?: string }): void {
  const plan = planOf(world);
  plan.unit.push(...(added.unit ?? []));
  plan.bdd.push(...(added.bdd ?? []));
  plan.typecheck = added.typecheck ?? plan.typecheck;
  apply(world, plan);
}

const testId = (name: string): string => `${TEST_FILE} > ${name}`;
const testNamed = (name: string): string => UNIT_TESTS[name.split(" > ").pop() as keyof typeof UNIT_TESTS];

/** The round of the test-writing agent that writes the unit test `name` (`describe > it`). */
export function writesTest(name: string): Round {
  return { files: [{ path: TEST_FILE, content: testNamed(name) }], test: testId(name) };
}

export const codeRound = (content: string): Round => ({ files: [{ path: CART_FILE, content }] });

Given("the step-writing agent writes the steps of each scenario it is given, and they fail because the cart code does not exist yet", function (this: OidWorld) {
  agentOf(this).stepRounds = STEP_ROUNDS.map((content) => [{ path: STEP_FILE, content }]);
  plans.set(this, { unit: ["unit-baseline"], bdd: [MISSING_IMPLEMENTATION], typecheck: null });
  apply(this, planOf(this));
});

Given("the test-writing agent writes the unit test {string}, and it fails because the cart code does not exist yet", function (this: OidWorld, name: string) {
  agentOf(this).testRoute.rounds.push(writesTest(name));
  expect(this, { unit: ["unit-red-missing"] });
});

Given("the test-writing agent writes a unit test that fails with an error that is not an assertion", function (this: OidWorld) {
  agentOf(this).testRoute.rounds.push(writesTest("cart lines > fails with an error"));
  agentOf(this).testRoute.rounds[0]!.test = testId("cart lines > adds a line");
  expect(this, { unit: ["unit-red-not-assertion"] });
});

Given("the coding agent writes the cart code that passes the unit test and the scenario", function (this: OidWorld) {
  agentOf(this).codeRoute.rounds.push(codeRound(CART_CODE.withCount));
  expect(this, { unit: ["unit-green"], bdd: ["bdd-add-line-green"] });
});

Given("the coding agent writes the cart code that passes the unit test, but the scenario still fails", function (this: OidWorld) {
  agentOf(this).codeRoute.rounds.push(codeRound(CART_CODE.unitOnly));
  expect(this, { unit: ["unit-green"], bdd: ["bdd-add-line-still-red"] });
});

Given("the coding agent writes the cart code that passes the unit test, but breaks the scenario {string}", function (this: OidWorld, scenario: string) {
  assert.equal(scenario, "Add to cart");
  agentOf(this).codeRoute.rounds.push(codeRound(CART_CODE.withCount));
  expect(this, { unit: ["unit-green"], bdd: ["regression"] });
});

Given("the test-writing agent then reports that no unit logic is left", function (this: OidWorld) {
  agentOf(this).testRoute.rounds.push({ files: [], noUnitLogicLeft: true });
});

Given("the coding agent then writes the wiring that makes the scenario pass", function (this: OidWorld) {
  agentOf(this).codeRoute.rounds.push(codeRound(CART_CODE.withCount));
  expect(this, { unit: ["unit-green"], bdd: ["bdd-add-line-green"] });
});

Given("the test-writing agent reports that no unit logic is left", function (this: OidWorld) {
  agentOf(this).testRoute.rounds.push({ files: [], noUnitLogicLeft: true });
});

Given("the test-writing agent also tries to write {string} and {string}", function (this: OidWorld, first: string, second: string) {
  agentOf(this).testRoute.attempts = [first, second];
});

Given("the coding agent also tries to write {string} and {string}", function (this: OidWorld, first: string, second: string) {
  agentOf(this).codeRoute.attempts = [first, second];
});

/** The ways a test-writing attempt goes wrong, with the recorded unit report of the run of its test. */
const TEST_PROBLEMS: Record<string, { round: Round; unit?: string }> = {
  "it writes no unit test": { round: { files: [] } },
  "its unit test passes at once": { round: { ...writesTest("cart lines > passes at once"), test: testId("cart lines > adds a line") }, unit: "unit-passes-at-once" },
  "it reports a unit test that is not in the file": { round: { ...writesTest("cart lines > adds a line"), test: testId("cart lines > subtracts a line") }, unit: "unit-green" },
  "its unit test breaks another one that passed": { round: writesTest("cart lines > adds a line"), unit: "unit-regression" },
};

Given(/^the test-writing agent's attempt goes wrong because (.+)$/, function (this: OidWorld, problem: string) {
  const bypassed = /^it also changes "(.+)" without the sandbox noticing$/.exec(problem)?.[1];
  const found = bypassed === undefined ? TEST_PROBLEMS[problem] : { round: { ...writesTest("cart lines > adds a line"), bypass: [{ path: bypassed, content: "// changed\n" }] } };
  assert.ok(found !== undefined, `unknown problem: ${problem}`);
  agentOf(this).testRoute.rounds.push(found.round);
  expect(this, { unit: found.unit === undefined ? [] : [found.unit] });
});

/** The ways a coding attempt goes wrong, with what the fake runners replay for it. */
const CODE_PROBLEMS: Record<string, { round: Round; unit?: string; typecheck?: string }> = {
  "it changes the unit test": { round: { ...codeRound(CART_CODE.withCount), bypass: [{ path: TEST_FILE, content: `${UNIT_TESTS["adds a line"]}// changed\n` }] } },
  "its code does not make the unit test pass": { round: codeRound("export function addLine(lines: string[], line: string): string[] {\n  return lines;\n}\n"), unit: "unit-still-failing" },
  "its code has a type error": { round: codeRound(CART_CODE.withTypeError), unit: "unit-green", typecheck: "typecheck-error" },
};

Given(/^the coding agent's attempt goes wrong because (.+)$/, function (this: OidWorld, problem: string) {
  const found = CODE_PROBLEMS[problem];
  assert.ok(found !== undefined, `unknown problem: ${problem}`);
  agentOf(this).codeRoute.rounds.push(found.round);
  expect(this, { unit: found.unit === undefined ? [] : [found.unit], typecheck: found.typecheck });
});

Given(/^the (test-writing|coding) agent (reports that it is blocked with the reason ".+"|cannot reach its provider)$/, function (this: OidWorld, agent: string, problem: string) {
  const route = agent === "coding" ? agentOf(this).codeRoute : agentOf(this).testRoute;
  const reason = BLOCKED_PATTERN.exec(problem)?.[1];
  if (reason === undefined) route.providerError = "the provider rejected the api key";
  else route.blocked = { reason: "spec_gap", detail: reason };
});

Given("the project limits the inner loop to {int} iterations for each scenario", function (this: OidWorld, limit: number) {
  change(this, (fixture) => {
    assert.ok(fixture.cucumber, "the project does not run its scenarios with cucumber");
    fixture.cucumber.limit = limit;
  });
});

Given("the agents write two unit tests and two pieces of cart code, and the scenario still fails after both", function (this: OidWorld) {
  const agent = agentOf(this);
  agent.testRoute.rounds.push(writesTest("cart lines > adds a line"), writesTest("cart lines > adds a second line"));
  agent.codeRoute.rounds.push(codeRound(CART_CODE.unitOnly), codeRound(CART_CODE.dedupedUnitOnly));
  expect(this, { unit: ["unit-red-missing", "unit-green", "unit-red-second", "unit-green-second"], bdd: ["bdd-add-line-still-red", "bdd-add-line-still-red"] });
});

Given("the agents write for each of the two scenarios a failing unit test and the cart code that passes it and the scenario", function (this: OidWorld) {
  const agent = agentOf(this);
  agent.testRoute.rounds.push(writesTest("cart lines > adds a line"), writesTest("cart lines > removes a line"));
  agent.codeRoute.rounds.push(codeRound(CART_CODE.withCount), codeRound(CART_CODE.withRemove));
  expect(this, { unit: ["unit-red-missing", "unit-green", "unit-red-remove", "unit-green-remove"], bdd: ["bdd-add-line-green", "bdd-remove-line-missing", "bdd-all-green"] });
});

/** The hash of the commit of the worktree whose subject is `message`, if it has one. */
export function findCommit(world: OidWorld, message: string): string | undefined {
  const lines = git(worktreePath(world), "log", "--reflog", "--topo-order", "--format=%H\t%s").split("\n");
  return lines.map((line) => line.split("\t") as [string, string]).find(([, subject]) => subject === message)?.[0];
}

export function filesOfCommit(world: OidWorld, message: string): string[] {
  const found = findCommit(world, message);
  assert.ok(found, `the worktree has no commit "${message}"`);
  return git(worktreePath(world), "show", "--name-only", "--format=", found).split("\n");
}

Then("the worktree has the commit {string} with the unit test", function (this: OidWorld, message: string) {
  assert.ok(filesOfCommit(this, message).includes(TEST_FILE));
});

Then("the worktree has the commit {string} with the cart code", function (this: OidWorld, message: string) {
  assert.ok(filesOfCommit(this, message).includes(CART_FILE));
});

Then("the worktree has no commit {string}", function (this: OidWorld, message: string) {
  assert.equal(findCommit(this, message), undefined);
});

Then("the saved session records the unit test {string} for the scenario {string}", function (this: OidWorld, test: string, scenario: string) {
  const recorded = (session(this) as { scenarioUnitTests?: Record<string, string[]> }).scenarioUnitTests ?? {};
  assert.ok(recorded[scenario]?.includes(test), JSON.stringify(recorded));
});

function nthTask(tasks: string[], at: number, who: string): string {
  const task = tasks[at];
  assert.ok(task, `the ${who} agent was not run ${at + 1} time(s)`);
  return task;
}

Then("the first task of the test-writing agent includes the scenario {string} and its location {string}", function (this: OidWorld, name: string, location: string) {
  const task = nthTask(agentOf(this).testRoute.tasks, 0, "test-writing");
  assert.ok(task.includes(`Scenario: ${name}`), "no scenario");
  assert.ok(task.includes(location), `no location ${location}`);
  assert.equal(location, SCENARIO_FIRST_LINE);
});

Then("the first task of the test-writing agent includes the failure of the scenario and the signature of {string} with its description", function (this: OidWorld, name: string) {
  const task = nthTask(agentOf(this).testRoute.tasks, 0, "test-writing");
  assert.ok(task.includes("Cannot find module"), "no failure");
  assert.ok(task.includes("src/cart.js"), "the failure does not name the missing module");
  assert.ok(task.includes(`${name}(lines: string[]): number`), "no signature");
  assert.ok(task.includes("Counts the lines of a cart."), "no description");
});

Then("the first task of the test-writing agent includes neither the scenario {string} nor the body of {string}", function (this: OidWorld, other: string, name: string) {
  const task = nthTask(agentOf(this).testRoute.tasks, 0, "test-writing");
  assert.ok(task.includes("Scenario: Add a line"), "the task is empty");
  for (const marker of [`Scenario: ${other}`, "bodyMarker"]) assert.ok(!task.includes(marker), `the task includes ${marker} of ${name}`);
});

Then("the test-writing agent was refused both writes", function (this: OidWorld) {
  const { refused, attempts } = agentOf(this).testRoute;
  assert.deepEqual(refused, attempts);
  assert.equal(attempts.length, 2);
});

Then("the coding agent was refused both writes", function (this: OidWorld) {
  const { refused, attempts } = agentOf(this).codeRoute;
  assert.deepEqual(refused, attempts);
  assert.equal(attempts.length, 2);
});

Then("the test-writing agent had no shell tool", function (this: OidWorld) {
  const { toolNames, excludedTools } = agentOf(this).testRoute;
  assert.ok(toolNames.length > 0, "no session was opened");
  for (const names of toolNames) assert.ok(names.includes("write") && names.includes("report") && !names.includes("bash"), names.join(", "));
  for (const excluded of excludedTools) assert.ok(excluded.includes("bash"), excluded.join(", "));
});

/** Asserts that every session of the route had the shell, the write tool and the report tool. */
export function assertShellTool({ toolNames, excludedTools }: Route): void {
  assert.ok(toolNames.length > 0, "no session was opened");
  for (const names of toolNames) assert.ok(names.includes("bash") && names.includes("write") && names.includes("report"), names.join(", "));
  for (const excluded of excludedTools) assert.ok(!excluded.includes("bash"), excluded.join(", "));
}

Then("the coding agent had a shell tool", function (this: OidWorld) {
  assertShellTool(agentOf(this).codeRoute);
});

function unitRedQuestions(world: OidWorld) {
  return terminalOf(world).choices.filter((choice) => choice.actions.includes("trace"));
}

Then("the human was asked twice about the Red of the unit test {string}, with the actions {string}, {string} and {string}", function (this: OidWorld, name: string, first: string, second: string, third: string) {
  const asked = unitRedQuestions(this);
  assert.equal(asked.length, 2);
  for (const question of asked) {
    assert.ok(question.prompt.includes(name), question.prompt);
    assert.deepEqual(question.actions, [first, second, third]);
  }
});

Then("the second question about the unit test showed the whole failure, with its stack", function (this: OidWorld) {
  const [first, second] = unitRedQuestions(this);
  assert.ok(first && second, "the Red was not asked twice");
  assert.match(second.prompt, /the cart could not be built/);
  assert.match(second.prompt, /\n\s+at /);
  assert.doesNotMatch(first.prompt, /\n\s+at /);
});

Then("the first task of the coding agent includes the unit test {string} and its failure", function (this: OidWorld, file: string) {
  const task = nthTask(agentOf(this).codeRoute.tasks, 0, "coding");
  assert.ok(task.includes(`### ${file}`), "no unit test file");
  assert.ok(task.includes(UNIT_TESTS["adds a line"]), "the unit test is not in full");
  assert.ok(task.includes("Cannot find module '../../src/cart.js'"), "no failure");
});

Then("the first task of the coding agent includes the body of {string} and the signature of {string} with its description", function (this: OidWorld, name: string, again: string) {
  const task = nthTask(agentOf(this).codeRoute.tasks, 0, "coding");
  assert.equal(name, again);
  assert.ok(task.includes("bodyMarker"), "no body");
  assert.ok(task.includes(`${name}(lines: string[]): number`), "no signature");
  assert.ok(task.includes("Counts the lines of a cart."), "no description");
});

Then("the first task of the coding agent does not include the scenario {string}", function (this: OidWorld, name: string) {
  const task = nthTask(agentOf(this).codeRoute.tasks, 0, "coding");
  assert.ok(task.includes("cart lines"), "the task is empty");
  assert.ok(!task.includes(name), `the task includes ${name}`);
});

Then("the unit test {string} is as the test-writing agent wrote it", function (this: OidWorld, file: string) {
  assert.equal(worktreeText(this, file), UNIT_TESTS["adds a line"]);
});

Then("the second task of the test-writing agent includes the failure of the scenario after the code was written", function (this: OidWorld) {
  assert.ok(nthTask(agentOf(this).testRoute.tasks, 1, "test-writing").includes("countCartLines is not a function"));
});

Then("the second task of the coding agent includes the failure of the scenario after the code was written", function (this: OidWorld) {
  assert.ok(nthTask(agentOf(this).codeRoute.tasks, 1, "coding").includes("countCartLines is not a function"));
});

Then("progress.json of the worktree records {string} as {string}", function (this: OidWorld, scenario: string, status: string) {
  const progress = JSON.parse(readFileSync(join(worktreePath(this), "progress.json"), "utf8")) as { features: { scenarios?: { name: string; bdd: string }[] }[] };
  assert.equal(progress.features.flatMap((feature) => feature.scenarios ?? []).find(({ name }) => name === scenario)?.bdd, status);
});

Then("the event log of the run records no transition from {string} to {string}", function (this: OidWorld, from: string, to: string) {
  assert.ok(!transitions(this).some((event) => event.from === from && event.to === to), JSON.stringify(transitions(this)));
});

Then("the event log of the run records a transition from {string} to {string} once", function (this: OidWorld, from: string, to: string) {
  assert.equal(transitions(this).filter((event) => event.from === from && event.to === to).length, 1, JSON.stringify(transitions(this)));
});

Then("the event log of the run records a transition from {string} to {string} whose reason mentions {string}", function (this: OidWorld, from: string, to: string, text: string) {
  assert.ok(transitions(this).some((event) => event.from === from && event.to === to && event.reason?.includes(text)), JSON.stringify(transitions(this)));
});

Then("the human was asked once what to do with {string}, after {int} iterations, with the actions {string}, {string}, {string}, {string} and {string}", function (this: OidWorld, scenario: string, iterations: number, first: string, second: string, third: string, fourth: string, fifth: string) {
  const asked = terminalOf(this).choices.filter((choice) => choice.actions.includes("rewrite"));
  assert.equal(asked.length, 1);
  assert.ok(asked[0]!.prompt.includes(scenario), asked[0]!.prompt);
  assert.ok(asked[0]!.prompt.includes(`${iterations} iterations`), asked[0]!.prompt);
  assert.deepEqual(asked[0]!.actions, [first, second, third, fourth, fifth]);
});
