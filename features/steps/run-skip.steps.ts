import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { listScenarios } from "../../src/artifacts/traceability.js";
import { CART_FILE, TEST_FILE } from "../support/cart-files.js";
import { git } from "../support/run-project.js";
import type { OidWorld } from "../support/world.js";
import { worktreePath, worktreeText } from "./run-features.steps.js";
import { expect } from "./run-loop.steps.js";
import { eventLog, session } from "./run.steps.js";

type Recorded = { id: string; status: string; cycle_step?: string; scenarios?: { name: string; bdd: string }[] };

const progressOf = (world: OidWorld, id: string): Recorded | undefined => (JSON.parse(worktreeText(world, "progress.json")) as { features: Recorded[] }).features.find((feature) => feature.id === id);

/** The subjects of the commits on the run's branch, newest first. */
const branchSubjects = (world: OidWorld): string[] => git(worktreePath(world), "log", "--format=%s").split("\n");

/** The refs the run keeps the partial work of a feature's skipped scenarios under, with the commit each names. */
function wipRefs(world: OidWorld, fr: string): { ref: string; commit: string }[] {
  const prefix = `refs/oid/wip/${session(world).runId}/${fr}/`;
  return git(worktreePath(world), "for-each-ref", "--format=%(refname) %(objectname)", prefix)
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => ({ ref: line.split(" ")[0]!, commit: line.split(" ")[1]! }));
}

Given("the step-writing agent's steps for {string} fail because the cart code does not exist yet", function (this: OidWorld, scenario: string) {
  assert.equal(scenario, "Remove a line");
  expect(this, { bdd: ["bdd-remove-line-missing"] });
});

Then(/^the ref "refs\/oid\/wip\/" of the run for "([^"]+)" holds the commit "(.+)" with the unit test and the cart code$/, function (this: OidWorld, fr: string, subject: string) {
  const refs = wipRefs(this, fr);
  const held = refs.find(({ commit }) => git(worktreePath(this), "log", "-1", "--format=%s", commit) === subject);
  assert.ok(held, `no ref of the run holds "${subject}": ${JSON.stringify(refs)}`);
  const files = git(worktreePath(this), "ls-tree", "-r", "--name-only", held.commit).split("\n");
  assert.ok(files.includes(TEST_FILE) && files.includes(CART_FILE), files.join(", "));
});

Then("the run's branch does not hold the commit {string}", function (this: OidWorld, subject: string) {
  assert.ok(!branchSubjects(this).includes(subject), branchSubjects(this).join("\n"));
});

Then("in the feature file {string} of the worktree the scenario {string} is tagged {string} and the scenario {string} is not", function (this: OidWorld, file: string, tagged: string, tag: string, other: string) {
  const scenarios = listScenarios([{ path: file, text: worktreeText(this, file) }]);
  assert.ok(scenarios.find(({ name }) => name === tagged)?.tags.includes(tag), JSON.stringify(scenarios));
  assert.ok(!scenarios.find(({ name }) => name === other)?.tags.includes(tag), JSON.stringify(scenarios));
});

Then("the worktree has no {string} and has {string}", function (this: OidWorld, absent: string, present: string) {
  assert.ok(!existsSync(join(worktreePath(this), absent)), absent);
  assert.ok(existsSync(join(worktreePath(this), present)), present);
});

Then("the event log of the run records no error mentioning {string}", function (this: OidWorld, text: string) {
  const errors = eventLog(this).filter((event) => event.type === "error" && event.message?.includes(text));
  assert.deepEqual(errors, []);
});

Then(/^the run's branch holds no commit named "(.+)"$/, function (this: OidWorld, subject: string) {
  assert.ok(!branchSubjects(this).includes(subject), branchSubjects(this).join("\n"));
});

Then(/^the run's branch ends with the commit "(.+)", one commit since the start of the run$/, function (this: OidWorld, subject: string) {
  assert.deepEqual(git(worktreePath(this), "log", "--format=%s", `${session(this).baseCommit}..HEAD`).split("\n"), [subject]);
});

Then("the run's branch has no commit since the start of the run", function (this: OidWorld) {
  assert.equal(git(worktreePath(this), "rev-list", "--count", `${session(this).baseCommit}..HEAD`), "0");
});

Then("the body of that commit lists the passing scenario {string} and the skipped scenario {string} with its reason {string} and the ref that holds its partial work", function (this: OidWorld, passing: string, skipped: string, reason: string) {
  const body = git(worktreePath(this), "log", "-1", "--format=%b");
  const [ref] = wipRefs(this, "FR-CART-02");
  assert.ok(ref, "the run keeps no ref of partial work");
  for (const text of [passing, skipped, reason, ref.ref]) assert.ok(body.includes(text), `the body does not include "${text}":\n${body}`);
});

Then("{string} is in progress at {string} in the progress file of the worktree, with {string} as {string} and {string} as {string}", function (this: OidWorld, id: string, step: string, first: string, firstStatus: string, second: string, secondStatus: string) {
  const feature = progressOf(this, id);
  assert.deepEqual([feature?.status, feature?.cycle_step], ["in_progress", step]);
  assert.deepEqual(feature?.scenarios?.map(({ name, bdd }) => [name, bdd]), [[first, firstStatus], [second, secondStatus]]);
});

Then("in the progress file of the worktree {string} is pending, with no cycle step and no scenarios", function (this: OidWorld, id: string) {
  const feature = progressOf(this, id);
  assert.ok(feature, `${id} is not tracked`);
  assert.deepEqual({ status: feature.status, cycle_step: feature.cycle_step, scenarios: feature.scenarios }, { status: "pending", cycle_step: undefined, scenarios: undefined });
});
