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
