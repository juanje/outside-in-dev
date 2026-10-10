import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CART_CODE } from "../support/cart-files.js";
import { ProcessDied, type Route } from "../support/fake-agent.js";
import { terminalOf } from "../support/terminal.js";
import { type OidWorld, splitArgs } from "../support/world.js";
import { runCli } from "../../src/run-cli.js";
import { agentOf, runWithTerminal, worktreePath, worktreeText } from "./run-features.steps.js";
import { codeRound, expect } from "./run-loop.steps.js";
import { assertStampedWithTheirTimes, eventLog, holdLockOfDeadProcess, lockedBy, lockHolder, lockText, PROJECT, session } from "./run.steps.js";

/** The event a resumed run logs first: the state it resumes at, the files it discarded and the process whose lock it released. */
type Resumed = { type: string; state?: string; discarded?: string[]; releasedLock?: number };

const resumedEvents = new WeakMap<OidWorld, Resumed>();
/** How long a process that was signalled has to end. */
const SIGNAL_WAIT_MS = 5_000;

const routeOf = (world: OidWorld, who: string): Route => (who === "coding" ? agentOf(world).codeRoute : agentOf(world).testRoute);

/** Runs `oid <command>` in this process, as another terminal would while the run works: with the services of the run, whose signal reaches it. */
function runsWhileItWorks(world: OidWorld, commandLine: string): () => Promise<void> {
  return async () => {
    const args = splitArgs(commandLine);
    if (args[0] === "oid") args.shift();
    await runCli(args, { cwd: world.projectDir, stdout: () => undefined, stderr: () => undefined }, world.services);
  };
}

Given("{string} was run without a terminal and saved its question about the feature files", async function (this: OidWorld, commandLine: string) {
  assert.ok(this.services, "no services were set up");
  this.services = { ...this.services, input: { isTTY: false } };
  await this.run(commandLine);
  assert.equal(this.exitCode, 3, `${this.stdout}${this.stderr}`);
});

Given(/^the (test-writing|coding) agent writes the file "(.+)" and then the process dies$/, function (this: OidWorld, who: string, file: string) {
  routeOf(this, who).rounds.push({ files: [{ path: file, content: "// half done\n" }], dies: true });
});

Given("the coding agent then writes the cart code that passes the unit test and the scenario", function (this: OidWorld) {
  agentOf(this).codeRoute.rounds.push(codeRound(CART_CODE.withCount));
  expect(this, { unit: ["unit-green"], bdd: ["bdd-add-line-green"] });
});

Given("the test-writing agent runs {string} while it works", function (this: OidWorld, commandLine: string) {
  agentOf(this).testRoute.during.set(0, runsWhileItWorks(this, commandLine));
});

Given("the coding agent runs {string} while it writes the code of the second scenario", function (this: OidWorld, commandLine: string) {
  agentOf(this).codeRoute.during.set(1, runsWhileItWorks(this, commandLine));
});

Given("the BDD runner replays the check of the last scenario once more for the resumed run", function (this: OidWorld) {
  expect(this, { bdd: ["bdd-all-green"] });
});

When(/^I run "(.+)" with a terminal where the human answers "(.+)", and the process dies while the (test-writing|coding) agent works$/, async function (this: OidWorld, commandLine: string, answer: string, who: string) {
  const died = await runWithTerminal(this, commandLine, [answer], []).then(
    () => undefined,
    (error: unknown) => error,
  );
  assert.ok(died instanceof ProcessDied, `the process did not die: ${String(died)}`);
  assert.equal(died.route, who);
  // A run in this process releases its lock as it unwinds; a killed process leaves it behind, naming a process that is gone.
  holdLockOfDeadProcess(this);
});

Then("the lock of the project is still held by the process that died", function (this: OidWorld) {
  assert.equal(lockText(this), `${lockedBy(this)}\n`);
});

Then("the worktree has the file {string}", function (this: OidWorld, file: string) {
  assert.ok(existsSync(join(worktreePath(this), file)), `${file} does not exist`);
});

Then("the question showed the text of the feature file of {string}", function (this: OidWorld, id: string) {
  const [asked] = terminalOf(this).choices;
  assert.ok(asked, "the human was not asked");
  assert.ok(asked.prompt.includes(worktreeText(this, `features/${id}.feature`)), asked.prompt);
});

Then("the event log of the run records that the run was resumed at {string}", function (this: OidWorld, state: string) {
  const resumed = (eventLog(this) as Resumed[]).filter((event) => event.type === "resumed");
  assert.equal(resumed.length, 1, JSON.stringify(eventLog(this)));
  assert.equal(resumed[0]!.state, state);
  resumedEvents.set(this, resumed[0]!);
});

Then("the events of the run from the resume on were stamped with the times they happened, not all the same", function (this: OidWorld) {
  const events = eventLog(this);
  const from = events.findIndex((event) => event.type === "resumed");
  assert.ok(from >= 0, "the run was not resumed");
  assertStampedWithTheirTimes(events.slice(from));
});

function resumedEvent(world: OidWorld): Resumed {
  const found = resumedEvents.get(world);
  assert.ok(found, "no resumed event was found");
  return found;
}

Then("that event lists no discarded file", function (this: OidWorld) {
  assert.deepEqual(resumedEvent(this).discarded, []);
});

Then("that event lists {string} as discarded", function (this: OidWorld, file: string) {
  assert.deepEqual(resumedEvent(this).discarded, [file]);
});

Then("that event says the lock of a process that was not running was released", function (this: OidWorld) {
  assert.equal(resumedEvent(this).releasedLock, Number(lockedBy(this)));
});

Then("the feature-writing agent was asked once in all", function (this: OidWorld) {
  assert.equal(agentOf(this).tasks.length, 1);
});

Then(/^the test-writing agent was asked (once|twice) in all$/, function (this: OidWorld, times: string) {
  assert.equal(agentOf(this).testRoute.tasks.length, times === "once" ? 1 : 2);
});

Then("the step-writing agent was asked once for {string}", function (this: OidWorld, scenario: string) {
  assert.equal(agentOf(this).stepTasks.filter((task) => task.includes(`Scenario: ${scenario}`)).length, 1);
});

Then(/^the (test-writing|coding) agent was asked twice, with the same task each time$/, function (this: OidWorld, who: string) {
  const { tasks } = routeOf(this, who);
  assert.equal(tasks.length, 2);
  assert.equal(tasks[1], tasks[0]);
});

Then("the coding agent was not asked", function (this: OidWorld) {
  assert.equal(agentOf(this).codeRoute.tasks.length, 0);
});

Then("the saved session holds the hash of the feature file of {string}, as it is in the worktree", function (this: OidWorld, id: string) {
  const file = `features/${id}.feature`;
  assert.equal(session(this).featureHashes?.[file], `sha256:${createHash("sha256").update(worktreeText(this, file)).digest("hex")}`);
});

Then("the worktree has a feature file for {string}", function (this: OidWorld, id: string) {
  assert.match(worktreeText(this, `features/${id}.feature`), new RegExp(`@${id}`));
});

Then("the process that holds the lock was signalled once", function (this: OidWorld) {
  assert.deepEqual(this.signalled, [this.services?.pid]);
});

Then("no process was signalled", function (this: OidWorld) {
  assert.deepEqual(this.signalled, []);
});

Then("the error mentions the lock, the process that is gone and that {string} releases it", function (this: OidWorld, command: string) {
  for (const text of [".outside-in/lock", lockedBy(this), `${command}`, "releases"]) assert.ok(this.stderr.includes(text), this.stderr);
});

Then("the saved session still names the run {string} with its pending question", function (this: OidWorld, runId: string) {
  const saved = session(this);
  assert.equal(saved.runId, runId);
  assert.equal(saved.state, "BASELINE");
  assert.equal(saved.pendingInput?.prompt, "Old question?");
});

Then("the project has no lock file", function (this: OidWorld) {
  assert.equal(lockText(this), undefined);
  assert.ok(existsSync(this.path(PROJECT)));
});

Then("the process that holds the lock was stopped by the signal {string}", async function (this: OidWorld, signal: string) {
  const holder = lockHolder(this);
  const ended = holder.exitCode !== null || holder.signalCode !== null ? Promise.resolve() : new Promise<void>((done) => holder.once("exit", () => done()));
  await Promise.race([ended, new Promise<void>((done) => setTimeout(done, SIGNAL_WAIT_MS).unref())]);
  assert.equal(holder.signalCode, signal, `the holder ended with ${holder.exitCode ?? "no exit code"} and ${holder.signalCode ?? "no signal"}`);
});
