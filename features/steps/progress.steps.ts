import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import type { Feature, OidWorld, Progress } from "../support/world.js";

function feature(progress: Progress, id: string): Feature {
  const found = progress.features.find((f) => f.id === id);
  assert.ok(found, `feature ${id} is not in progress.json`);
  return found;
}

Given("a tracked feature {string} titled {string}", function (this: OidWorld, id: string, title: string) {
  const progress = this.loadProgress();
  progress.features.push({ id, title, status: "pending" });
  this.saveProgress(progress);
});

Given(
  "a tracked feature {string} with a scenario {string} marked {string}",
  function (this: OidWorld, id: string, name: string, bdd: string) {
    const progress = this.loadProgress();
    progress.features.push({
      id,
      title: `Title of ${id}`,
      status: "in_progress",
      cycle_step: "bdd_red",
      scenarios: [{ name, bdd }],
    });
    this.saveProgress(progress);
  },
);

Given(
  "the started feature {string} also has a scenario {string} marked {string}",
  function (this: OidWorld, id: string, name: string, bdd: string) {
    const progress = this.loadProgress();
    (feature(progress, id).scenarios ??= []).push({ name, bdd });
    this.saveProgress(progress);
  },
);

Given("the focus is on {string}", function (this: OidWorld, id: string) {
  const progress = this.loadProgress();
  progress.current_focus = id;
  this.saveProgress(progress);
});

Given("no feature is focused", function (this: OidWorld) {
  const progress = this.loadProgress();
  progress.current_focus = null;
  this.saveProgress(progress);
});

When("I run {string}", function (this: OidWorld, commandLine: string) {
  this.run(commandLine);
});

Then("the command succeeds", function (this: OidWorld) {
  assert.equal(this.exitCode, 0, `expected exit code 0, got ${this.exitCode}; stderr: ${this.stderr}`);
});

Then("the command fails", function (this: OidWorld) {
  assert.equal(this.exitCode, 1, `expected exit code 1, got ${this.exitCode}; stdout: ${this.stdout}`);
});

Then("the output contains {string}", function (this: OidWorld, text: string) {
  assert.ok(this.stdout.includes(text), `stdout does not contain "${text}":\n${this.stdout}`);
});

Then("the output does not contain {string}", function (this: OidWorld, text: string) {
  assert.ok(!this.stdout.includes(text), `stdout unexpectedly contains "${text}":\n${this.stdout}`);
});

Then("the error output contains {string}", function (this: OidWorld, text: string) {
  assert.ok(this.stderr.includes(text), `stderr does not contain "${text}":\n${this.stderr}`);
});

Given("a SPEC.md defining the requirements {string}", function (this: OidWorld, ids: string) {
  const sections = ids
    .split(",")
    .map((id) => id.trim())
    .map((id) => `### ${id}: Title of ${id}\n\nDescription of ${id}.\n`);
  this.write("SPEC.md", `# Spec\n\n## Requirements\n\n${sections.join("\n")}`);
});

Then("the progress file lists the features {string}", function (this: OidWorld, ids: string) {
  const actual = this.loadProgress().features.map((f) => f.id);
  assert.deepEqual(actual, ids.split(",").map((id) => id.trim()));
});

Then("the feature {string} has the title {string}", function (this: OidWorld, id: string, title: string) {
  assert.equal(feature(this.loadProgress(), id).title, title);
});

Then("the feature {string} has the status {string}", function (this: OidWorld, id: string, status: string) {
  assert.equal(feature(this.loadProgress(), id).status, status);
});

Then("the feature {string} has no cycle step", function (this: OidWorld, id: string) {
  assert.equal(feature(this.loadProgress(), id).cycle_step, undefined);
});

Then("the progress file is unchanged", function (this: OidWorld) {
  assert.notEqual(this.progressBefore, null, "no progress file existed before the command");
  assert.equal(this.readProgressRaw(), this.progressBefore);
});

Then("the current focus is {string}", function (this: OidWorld, id: string) {
  assert.equal(this.loadProgress().current_focus, id);
});

Given(
  "a started feature {string} at step {string}",
  function (this: OidWorld, id: string, step: string) {
    const progress = this.loadProgress();
    progress.features.push({
      id,
      title: `Title of ${id}`,
      status: "in_progress",
      cycle_step: step,
      scenarios: [],
    });
    this.saveProgress(progress);
  },
);

Given("a completed feature {string}", function (this: OidWorld, id: string) {
  const progress = this.loadProgress();
  progress.features.push({
    id,
    title: `Title of ${id}`,
    status: "done",
    scenarios: [{ name: "It works", bdd: "pass" }],
  });
  this.saveProgress(progress);
});

Then("the feature {string} has the cycle step {string}", function (this: OidWorld, id: string, step: string) {
  assert.equal(feature(this.loadProgress(), id).cycle_step, step);
});

Then(
  "the feature {string} has the scenario {string} marked {string}",
  function (this: OidWorld, id: string, name: string, bdd: string) {
    const scenario = feature(this.loadProgress(), id).scenarios?.find((s) => s.name === name);
    assert.ok(scenario, `feature ${id} has no scenario "${name}"`);
    assert.equal(scenario.bdd, bdd);
  },
);

Then("the feature {string} has {int} scenarios", function (this: OidWorld, id: string, count: number) {
  assert.equal(feature(this.loadProgress(), id).scenarios?.length ?? 0, count);
});

Then("no feature is focused in the progress file", function (this: OidWorld) {
  assert.equal(this.loadProgress().current_focus, null);
});
