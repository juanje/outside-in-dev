import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import type { OidWorld } from "../support/world.js";

const CATEGORIES = ["complexity", "dead_code", "doc_drift", "duplication", "magic_value"];

Given("the project is a git repository without commits", function (this: OidWorld) {
  this.git("init", "--quiet");
  this.git("config", "user.name", "Fixture");
  this.git("config", "user.email", "fixture@example.com");
});

Given("the project is a git repository with its files committed", function (this: OidWorld) {
  this.git("init", "--quiet");
  this.git("config", "user.name", "Fixture");
  this.git("config", "user.email", "fixture@example.com");
  this.git("add", "-A");
  this.git("commit", "--quiet", "--message", "fixture");
});

Given("the changes are staged", function (this: OidWorld) {
  this.git("add", "-A");
});

type Snapshot = { date: string; counts: Record<string, number>; duplication: { source: number; tests: number } };

/** The lines of the history file, parsed; the file must exist. */
function snapshots(world: OidWorld, path: string): Snapshot[] {
  assert.ok(existsSync(world.path(path)), `${path} does not exist; stdout: ${world.stdout}; stderr: ${world.stderr}`);
  return readFileSync(world.path(path), "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as Snapshot);
}

const HISTORY_FILE = ".outside-in/metrics.jsonl";

function lastSnapshot(world: OidWorld): Snapshot {
  const all = snapshots(world, HISTORY_FILE);
  assert.ok(all.length > 0, `${HISTORY_FILE} has no snapshot`);
  return all.at(-1)!;
}

Then(/^the file "([^"]+)" has (\d+) snapshots?$/, function (this: OidWorld, path: string, count: string) {
  assert.equal(snapshots(this, path).length, Number(count));
});

Then("the last snapshot is complete", function (this: OidWorld) {
  const { date, counts, duplication } = lastSnapshot(this);
  assert.ok(!Number.isNaN(Date.parse(date)), `date ${date} is not a date`);
  assert.deepEqual(Object.keys(counts).sort(), CATEGORIES);
  assert.ok(Object.values(counts).every((count) => Number.isInteger(count)), "a count is not a whole number");
  assert.deepEqual(Object.keys(duplication).sort(), ["source", "tests"]);
});

Then("the last snapshot counts {word} {int}", function (this: OidWorld, category: string, count: number) {
  assert.equal(lastSnapshot(this).counts[category], count);
});

Then("the last snapshot records duplication of source files {float}", function (this: OidWorld, percentage: number) {
  assert.equal(lastSnapshot(this).duplication.source, percentage);
});

Then("the last snapshot records duplication of test files {float}", function (this: OidWorld, percentage: number) {
  assert.equal(lastSnapshot(this).duplication.tests, percentage);
});

Then("the output has the trend line {string}", function (this: OidWorld, line: string) {
  const trend = this.stdout.split("\n").filter((text) => text.startsWith("trend:"));
  assert.ok(trend.includes(line), `no trend line "${line}" in:\n${this.stdout}`);
});

Then("the output has no trend line", function (this: OidWorld) {
  const trend = this.stdout.split("\n").filter((text) => text.startsWith("trend:"));
  assert.deepEqual(trend, []);
});
