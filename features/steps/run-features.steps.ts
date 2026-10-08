import { Before, Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { detectorOf } from "../support/fake-detector.js";
import { FakeAgent } from "../support/fake-agent.js";
import { git, runWorktree, worktrees } from "../support/run-project.js";
import { terminalOf } from "../support/terminal.js";
import type { OidWorld } from "../support/world.js";
import { commit, eventLog, PROJECT, session, transitions, writeIn } from "./run.steps.js";

type LineAnswer = () => string;

const agents = new WeakMap<OidWorld, FakeAgent>();

export function agentOf(world: OidWorld): FakeAgent {
  const found = agents.get(world);
  assert.ok(found, "no agent was set up");
  return found;
}

export const worktreePath = (world: OidWorld): string => runWorktree(world).path;
export const worktreeText = (world: OidWorld, file: string): string => readFileSync(join(worktreePath(world), file), "utf8");

Before({ tags: "@FR-RUN-02 or @FR-RUN-03 or @FR-RUN-04 or @FR-RUN-05 or @FR-RUN-06" }, function (this: OidWorld) {
  const agent = new FakeAgent();
  agents.set(this, agent);
  this.services = { sdk: agent.sdk, input: { isTTY: false }, pid: process.pid, agentDir: this.path("agent"), detect: detectorOf(this).detect };
});

Given("the project has a DOMAIN.md and a feature file for {string}", function (this: OidWorld, id: string) {
  writeIn(this, "DOMAIN.md", "# Domain\n\nA cart-domain-marker is a thing.\n");
  writeIn(this, `features/${id}.feature`, `@${id}\nFeature: Existing ${id}\n  Scenario: existing-feature-marker\n    Given a cart\n`);
  commit(this);
});

Given("the feature-writing agent writes a valid feature file for each requirement it is given", function (this: OidWorld) {
  assert.ok(agentOf(this));
});

Given("the feature-writing agent writes no file for {string}", function (this: OidWorld, id: string) {
  agentOf(this).filesFor.set(id, () => []);
});

Given("the feature-writing agent reports that it is blocked with the reason {string}", function (this: OidWorld, detail: string) {
  agentOf(this).blocked = { reason: "spec_conflict", detail };
});

Given("the feature-writing agent changes a file it does not report", function (this: OidWorld) {
  agentOf(this).unreported = [{ path: "features/extra.feature", content: "@FR-CART-02\nFeature: Extra\n" }];
});

Given("the agent also tries to write {string} and {string}", function (this: OidWorld, first: string, second: string) {
  agentOf(this).attempts = [first, second];
});

const PROBLEMS: Record<string, (fr: string) => string> = {
  "that is not valid Gherkin": () => "this is not gherkin\n",
  "with no scenario": (fr) => `@${fr}\nFeature: Nothing\n`,
  'whose scenario is tagged "@FR-CART-03"': () => "Feature: Other\n  @FR-CART-03\n  Scenario: Other\n    Given a cart\n",
  "whose scenario has no requirement tag": () => "Feature: Untraced\n  Scenario: Untraced\n    Given a cart\n",
  'whose scenario is tagged "@NFR-09"': (fr) => `@${fr}\nFeature: Unknown\n  @NFR-09\n  Scenario: Unknown\n    Given a cart\n`,
};

Given(/^the feature-writing agent writes for "([^"]+)" a feature file (.+)$/, function (this: OidWorld, id: string, problem: string) {
  const content = PROBLEMS[problem]?.(id);
  assert.ok(content !== undefined, `unknown problem: ${problem}`);
  agentOf(this).filesFor.set(id, () => [{ path: `features/${id}.feature`, content }]);
});

/** Runs the command in this process with a terminal that answers the review from `choices` and the lines it is asked for from `lines`. */
export async function runWithTerminal(world: OidWorld, commandLine: string, choices: string[], lines: LineAnswer[]): Promise<void> {
  const terminal = terminalOf(world);
  const base = world.services;
  assert.ok(base, "no services were set up");
  world.services = {
    ...base,
    input: {
      isTTY: true,
      choose: async (prompt: string, actions: string[]) => {
        terminal.choices.push({ prompt, actions });
        return choices.shift() ?? "";
      },
      line: async () => lines.shift()?.() ?? "",
    },
  };
  await world.run(commandLine);
}

When("I run {string} with a terminal where the human answers {string}", async function (this: OidWorld, commandLine: string, answer: string) {
  await runWithTerminal(this, commandLine, [answer], []);
});

When("I run {string} with a terminal where the human edits {string} adding a scenario {string} and answers {string}", async function (this: OidWorld, commandLine: string, file: string, scenario: string, answer: string) {
  const edit = () => {
    appendFileSync(join(worktreePath(this), file), `\n  Scenario: ${scenario}\n    Given a cart\n`);
    return "";
  };
  await runWithTerminal(this, commandLine, [answer], [edit]);
});

When("I run {string} with a terminal where the human answers {string} with the comment {string} and then {string}", async function (this: OidWorld, commandLine: string, first: string, comment: string, second: string) {
  await runWithTerminal(this, commandLine, [first, second], [() => comment]);
});

When("I run {string} with a terminal where the human answers {string} and then {string}", async function (this: OidWorld, commandLine: string, first: string, second: string) {
  await runWithTerminal(this, commandLine, [first, second], []);
});

When("I run {string} with a terminal where the human answers {string}, {string} and {string}", async function (this: OidWorld, commandLine: string, first: string, second: string, third: string) {
  await runWithTerminal(this, commandLine, [first, second, third], []);
});

When("I run {string} without a terminal", async function (this: OidWorld, commandLine: string) {
  await this.run(commandLine);
});

Then("the worktree has a feature file for {string} and one for {string}", function (this: OidWorld, first: string, second: string) {
  for (const id of [first, second]) assert.match(worktreeText(this, `features/${id}.feature`), new RegExp(`@${id}`));
});

Then("the event log of the run records the transitions to {string} and {string}, in that order", function (this: OidWorld, first: string, second: string) {
  const states = transitions(this).map((event) => event.to);
  assert.ok(states.indexOf(first) >= 0 && states.indexOf(first) < states.indexOf(second), states.join(", "));
});

function firstTask(world: OidWorld): string {
  const [task] = agentOf(world).tasks;
  assert.ok(task, "the agent was not run");
  return task.text;
}

Then("the agent's task includes the whole text of {string} and of {string}", function (this: OidWorld, first: string, second: string) {
  for (const id of [first, second]) {
    assert.ok(firstTask(this).includes(`### ${id}: Feature ${id}`), `no heading of ${id}`);
    assert.ok(firstTask(this).includes(`It does what ${id} says.`), `no body of ${id}`);
  }
});

Then("the agent's task includes the DOMAIN.md of the project and the feature file of {string}", function (this: OidWorld, id: string) {
  assert.ok(firstTask(this).includes("cart-domain-marker"), "no DOMAIN.md");
  assert.ok(firstTask(this).includes(`Feature: Existing ${id}`), "no feature file");
});

Then("the agent's task includes no source file and no test", function (this: OidWorld) {
  assert.ok(firstTask(this).includes("Feature: Existing"), "the task is empty");
  for (const marker of ["cartSourceMarker", "cart-test-marker"]) assert.ok(!firstTask(this).includes(marker), `the task includes ${marker}`);
});

Then("the agent was refused both writes", function (this: OidWorld) {
  assert.deepEqual(agentOf(this).refused, agentOf(this).attempts);
});

Then("the worktree has no {string} and no {string}", function (this: OidWorld, first: string, second: string) {
  for (const file of [first, second]) assert.ok(!existsSync(join(worktreePath(this), file)), `${file} exists`);
});

Then("the agent had no shell tool", function (this: OidWorld) {
  const agent = agentOf(this);
  assert.ok(agent.toolNames.length > 0, "no session was opened");
  for (const names of agent.toolNames) {
    assert.ok(names.includes("write") && names.includes("report"), names.join(", "));
    assert.ok(!names.includes("bash"), names.join(", "));
  }
  for (const excluded of agent.excludedTools) assert.ok(excluded.includes("bash"), excluded.join(", "));
});

Then(/^the human was asked exactly (once|twice)$/, function (this: OidWorld, times: string) {
  assert.equal(terminalOf(this).choices.length, times === "once" ? 1 : 2);
});

Then("the question showed the text of the feature files of {string} and of {string}", function (this: OidWorld, first: string, second: string) {
  const [asked] = terminalOf(this).choices;
  assert.ok(asked, "the human was not asked");
  for (const id of [first, second]) assert.ok(asked.prompt.includes(worktreeText(this, `features/${id}.feature`)), `no text of ${id}`);
});

Then("the question named the worktree and offered the actions {string}, {string} and {string}", function (this: OidWorld, first: string, second: string, third: string) {
  const [asked] = terminalOf(this).choices;
  assert.ok(asked, "the human was not asked");
  assert.ok(asked.prompt.includes(worktreePath(this)), "the worktree is not named");
  assert.deepEqual(asked.actions, [first, second, third]);
});

Then("the saved session has the state {string}", function (this: OidWorld, state: string) {
  assert.equal(session(this).state, state);
});

const hashOf = (text: string): string => `sha256:${createHash("sha256").update(text).digest("hex")}`;

Then("the saved session holds the hash of each feature file of {string} and {string}, as they are in the worktree", function (this: OidWorld, first: string, second: string) {
  for (const id of [first, second]) {
    const file = `features/${id}.feature`;
    assert.equal(session(this).featureHashes?.[file], hashOf(worktreeText(this, file)), file);
  }
});

function worktreeProgress(world: OidWorld): { features: { id: string; status: string; cycle_step?: string }[] } {
  return JSON.parse(worktreeText(world, "progress.json"));
}

Then("in the worktree {string} and {string} are in progress at the step {string}", function (this: OidWorld, first: string, second: string, step: string) {
  for (const id of [first, second]) {
    const feature = worktreeProgress(this).features.find((candidate) => candidate.id === id);
    assert.deepEqual([feature?.status, feature?.cycle_step], ["in_progress", step], id);
  }
});

Then("{string} is still done", function (this: OidWorld, id: string) {
  assert.equal(worktreeProgress(this).features.find((candidate) => candidate.id === id)?.status, "done");
});

Then("progress.json of the user's copy is as it was", function (this: OidWorld) {
  assert.equal(git(this.projectDir, "status", "--porcelain"), "");
  assert.ok(!readFileSync(this.path(join(PROJECT, "progress.json")), "utf8").includes("bdd_red"));
});

Then("a line printed says the feature files were approved and BDD Red is next", function (this: OidWorld) {
  assert.ok(this.stdout.split("\n").some((line) => /approved/.test(line) && /BDD Red is next/.test(line)), this.stdout);
});

/** The files of the commit of the worktree whose subject is `message`. */
function filesOfCommit(world: OidWorld, message: string): string[] {
  const path = worktreePath(world);
  const found = git(path, "log", "--format=%H\t%s").split("\n").map((line) => line.split("\t") as [string, string]).find(([, subject]) => subject === message);
  assert.ok(found, `the worktree has no commit "${message}"`);
  return git(path, "show", "--name-only", "--format=", found[0]).split("\n");
}

Then("the worktree has the commit {string} with the feature files and the progress update", function (this: OidWorld, message: string) {
  const files = filesOfCommit(this, message);
  for (const file of ["features/FR-CART-02.feature", "features/FR-CART-03.feature", "progress.json"]) assert.ok(files.includes(file), files.join(", "));
});

Then("the worktree has the commit {string} with the edited file {string}", function (this: OidWorld, message: string, file: string) {
  assert.ok(filesOfCommit(this, message).includes(file));
  assert.match(worktreeText(this, file), /Remove a line/);
});

Then("the user's copy is on its own branch, at its own commit, with no change", function (this: OidWorld) {
  assert.equal(git(this.projectDir, "branch", "--show-current"), "main");
  assert.equal(git(this.projectDir, "log", "-1", "--format=%s"), "fixture");
  assert.equal(git(this.projectDir, "status", "--porcelain"), "");
});

Then("the event log of the run records a human edit of {string}", function (this: OidWorld, file: string) {
  assert.ok(eventLog(this).some((event) => event.type === "human_edit" && event.file === file), JSON.stringify(eventLog(this)));
});

Then("the saved session holds the hash of the edited {string}", function (this: OidWorld, file: string) {
  assert.equal(session(this).featureHashes?.[file], hashOf(worktreeText(this, file)));
  assert.match(worktreeText(this, file), /Remove a line/);
});

Then("the event log of the run records a transition from {string} to {string}", function (this: OidWorld, from: string, to: string) {
  assert.ok(transitions(this).some((event) => event.from === from && event.to === to), JSON.stringify(transitions(this)));
});

function tasksFor(world: OidWorld, id: string): string[] {
  return agentOf(world).tasks.filter((task) => task.fr === id).map((task) => task.text);
}

Then("the feature-writing agent was run again for {string} and for {string}", function (this: OidWorld, first: string, second: string) {
  for (const id of [first, second]) assert.equal(tasksFor(this, id).length, 2, id);
});

Then("the second task of the agent for {string} includes the comment {string}", function (this: OidWorld, id: string, comment: string) {
  const [first, second] = tasksFor(this, id);
  assert.ok(second?.includes(comment), "the comment is missing");
  assert.ok(!first?.includes(comment), "the first task has the comment");
});

Then("the output asks to review the feature files, with the actions {string}, {string} and {string}", function (this: OidWorld, first: string, second: string, third: string) {
  const line = this.stdout.split("\n").find((candidate) => candidate.startsWith("waiting for input"));
  assert.ok(line, this.stdout);
  assert.match(line, /feature files/);
  for (const action of [first, second, third]) assert.ok(line.includes(action), line);
});

Then("the saved session holds the pending question about the feature files", function (this: OidWorld) {
  const pending = session(this).pendingInput;
  assert.ok(pending);
  assert.match(pending.prompt, /feature files/);
  assert.deepEqual(pending.actions.map((action) => action.key), ["approve", "edit", "reject"]);
});

Then("the saved session holds no hash of a feature file", function (this: OidWorld) {
  assert.equal(session(this).featureHashes, undefined);
});

Then("the event log of the run records an error mentioning {string} and {string}", function (this: OidWorld, first: string, second: string) {
  const errors = eventLog(this).filter((event) => event.type === "error");
  assert.ok(errors.some((event) => event.message?.includes(first) && event.message.includes(second)), JSON.stringify(errors));
});

Then("the worktree is kept", function (this: OidWorld) {
  assert.equal(worktrees(this).length, 2);
});
