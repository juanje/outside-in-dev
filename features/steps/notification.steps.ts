import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git } from "../support/run-project.js";
import type { OidWorld } from "../support/world.js";
import { agentOf, worktreePath } from "./run-features.steps.js";
import { session, transitions, writeIn } from "./run.steps.js";

type Notification = Record<string, string | undefined>;
const CONFIG_FILE = ".outside-in.json";
const RECORD_FILE = "notifications.ndjson";

/** Kept outside the repository, so notifications from either copy append to the same record. */
function notifications(world: OidWorld): Notification[] {
  const file = world.path(RECORD_FILE);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as Notification);
}

function received(world: OidWorld, name: string): string {
  const records = notifications(world);
  assert.equal(records.length, 1, `expected one notification, got ${records.length}; stdout: ${world.stdout}; stderr: ${world.stderr}`);
  const value = records[0]![name];
  assert.equal(typeof value, "string", `the notification did not receive ${name}`);
  return value!;
}

Given("the project configuration sets {string} to {string}", function (this: OidWorld, field: string, value: string) {
  assert.equal(field, "settings.notify_command");
  const file = join(this.projectDir, CONFIG_FILE);
  const config = JSON.parse(readFileSync(file, "utf8")) as { settings?: Record<string, unknown> };
  config.settings = { ...config.settings, notify_command: value };
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  git(this.projectDir, "add", "--", CONFIG_FILE);
  git(this.projectDir, "commit", "--quiet", "--message", "configure notifications");
});

Given("the project configuration sets {string} to {int}", function (this: OidWorld, field: string, value: number) {
  assert.equal(field, "limits.max_retries");
  // Written into the committed configuration, like the notification command: changing the fixture would rewrite the file without it.
  const file = join(this.projectDir, CONFIG_FILE);
  const config = JSON.parse(readFileSync(file, "utf8")) as { limits?: Record<string, unknown> };
  if (config.limits?.max_retries === value) return;
  config.limits = { ...config.limits, max_retries: value };
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  git(this.projectDir, "add", "--", CONFIG_FILE);
  git(this.projectDir, "commit", "--quiet", "--message", "limit the retries");
});

Given('"notify.mjs" exits with code 7', function (this: OidWorld) {
  writeIn(this, "notify.mjs", "process.exit(7);\n");
  git(this.projectDir, "add", "--", "notify.mjs");
  git(this.projectDir, "commit", "--quiet", "--message", "install failing notification");
  assert.ok(existsSync(join(this.projectDir, "notify.mjs")));
});

Given("the test-writing agent writes no unit test", function (this: OidWorld) {
  agentOf(this).testRoute.rounds = [];
  assert.equal(agentOf(this).testRoute.rounds.length, 0);
});

Given("{string} records the values of {string} and {string}", function (this: OidWorld, script: string, first: string, second: string) {
  assert.equal(script, "notify.mjs");
  const record = this.path(RECORD_FILE);
  writeIn(this, script, [
    'import { appendFileSync } from "node:fs";',
    `const names = ${JSON.stringify([first, second])};`,
    "const values = Object.fromEntries(names.map((name) => [name, process.env[name]]));",
    `appendFileSync(${JSON.stringify(record)}, JSON.stringify(values) + "\\n");`,
    "",
  ].join("\n"));
  git(this.projectDir, "add", "--", script);
  git(this.projectDir, "commit", "--quiet", "--message", "install notification recorder");
  assert.deepEqual(notifications(this), []);
});

Then("the notification command was run once", function (this: OidWorld) {
  assert.equal(notifications(this).length, 1, `expected one notification; stdout: ${this.stdout}; stderr: ${this.stderr}`);
});

Then("the run is waiting for the human answer", function (this: OidWorld) {
  const pending = session(this).pendingInput;
  assert.ok(pending, "the run saved no pending question");
  assert.notEqual(pending.prompt, "");
});

Then("the output warns that the notification command failed", function (this: OidWorld) {
  assert.match(`${this.stdout}\n${this.stderr}`, /notification command.*(?:fail|exit|code)/i);
});

Then("the output warns that the notification command could not be run", function (this: OidWorld) {
  assert.match(`${this.stdout}\n${this.stderr}`, /notification command.*could not be run/i);
});

Then("the notification received {string} as {string}", function (this: OidWorld, name: string, expected: string) {
  assert.equal(received(this, name), expected);
});

Then("the notification received {string} describing {string}", function (this: OidWorld, name: string, description: string) {
  const message = received(this, name);
  assert.ok(message.toLowerCase().includes(description.toLowerCase()), `the notification does not describe ${description}`);
});

Then("the notification received {string} describing the question about the feature files", function (this: OidWorld, name: string) {
  const pending = session(this).pendingInput;
  assert.ok(pending, "the run saved no pending question");
  assert.match(pending.prompt, /feature files/i);
  const message = received(this, name);
  assert.match(message, /feature files/i, "the notification does not describe the feature-file question");
  assert.match(message, /review|approv/i, "the notification does not describe what the person is asked to do");
});

Then("the notification received {string} describing the finished feature {string}", function (this: OidWorld, name: string, feature: string) {
  const message = received(this, name);
  assert.match(message, new RegExp(feature));
  assert.match(message, /finish|complete|done/i, "the notification does not describe a finished feature");
});

Then("the worktree has the commit for {string}", function (this: OidWorld, feature: string) {
  const commits = git(worktreePath(this), "log", "--format=%H", "--", `features/${feature}.feature`).trim();
  assert.notEqual(commits, "", `the worktree has no commit for ${feature}`);
});

Then("the event log of the run records a transition to {string}", function (this: OidWorld, state: string) {
  assert.ok(transitions(this).some((event) => event.to === state), `no transition to ${state}`);
});
