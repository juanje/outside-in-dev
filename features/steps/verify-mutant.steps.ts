import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import type { OidWorld } from "../support/world.js";

const CHECKPOINTS_DIR = ".outside-in/checkpoints";

type Recorded = { name: string; bdd: string; mutant?: { diff: string; text: string } };

Given("the mutant file {string} containing:", function (this: OidWorld, path: string, content: string) {
  this.write(path, `${content}\n`);
});

Given("the standard input holds the mutant:", function (this: OidWorld, content: string) {
  this.services = { pid: process.pid, agentDir: this.path("agent"), ...this.services, readStdinSync: () => `${content}\n` };
});

Given("a later green ran the scenarios {string} and {string} of {string}", async function (this: OidWorld, first: string, second: string, id: string) {
  const { recordCheckpoint } = await import("../../src/artifacts/checkpoint.js");
  const scenarios = [first, second].map((name) => ({ feature: id, name }));
  recordCheckpoint(this.dir, { step: "tdd_green", feature: id, verify: { kind: "green", target: "all" }, external: false, date: new Date(), scenarios });
});

Then("the scenario {string} of {string} records the mutant:", function (this: OidWorld, name: string, id: string, diff: string) {
  const scenarios = (this.loadProgress().features.find((candidate) => candidate.id === id)?.scenarios ?? []) as Recorded[];
  const scenario = scenarios.find((candidate) => candidate.name === name);
  assert.ok(scenario, `${id} has no scenario "${name}"`);
  assert.ok(scenario.mutant, `the scenario "${name}" records no mutant`);
  assert.equal(scenario.mutant.diff, `${diff}\n`);
});

Then("the checkpoint records the mutant:", function (this: OidWorld, diff: string) {
  const file = `${CHECKPOINTS_DIR}/${this.loadProgress().current_focus}.json`;
  assert.ok(existsSync(this.path(file)), `no checkpoint was recorded in ${file}; stdout: ${this.stdout}; stderr: ${this.stderr}`);
  const { verify } = JSON.parse(readFileSync(this.path(file), "utf8")) as { verify: { mutant?: string } };
  assert.equal(verify.mutant, `${diff}\n`);
});
