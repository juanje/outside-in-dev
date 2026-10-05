import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import type { OidWorld } from "../support/world.js";

const CONFIG_FILE = ".outside-in.json";

const writtenFixtures = new WeakMap<OidWorld, Map<string, string>>();

function readConfigRaw(world: OidWorld): string {
  assert.ok(existsSync(world.path(CONFIG_FILE)), `${CONFIG_FILE} does not exist; stdout: ${world.stdout}; stderr: ${world.stderr}`);
  return readFileSync(world.path(CONFIG_FILE), "utf8");
}

Given("a project file {string} containing:", function (this: OidWorld, path: string, content: string) {
  const text = content.endsWith("\n") ? content : `${content}\n`;
  this.write(path, text);
  const fixtures = writtenFixtures.get(this) ?? new Map<string, string>();
  fixtures.set(path, text);
  writtenFixtures.set(this, fixtures);
});

Then(/^the configuration field "([^"]+)" is (.+)$/, function (this: OidWorld, field: string, expected: string) {
  let value: unknown = JSON.parse(readConfigRaw(this));
  for (const key of field.split(".")) {
    assert.ok(typeof value === "object" && value !== null && key in value, `${field} is missing from ${CONFIG_FILE}`);
    value = (value as Record<string, unknown>)[key];
  }
  assert.deepEqual(value, JSON.parse(expected), `${field} in ${CONFIG_FILE}`);
});

Then("the configuration file starts with:", function (this: OidWorld, expected: string) {
  const raw = readConfigRaw(this);
  assert.ok(raw.startsWith(expected), `${CONFIG_FILE} does not start with:\n${expected}\nbut with:\n${raw.slice(0, 120)}`);
});

Then("the configuration file ends with a single newline", function (this: OidWorld) {
  const raw = readConfigRaw(this);
  assert.ok(raw.endsWith("\n") && !raw.endsWith("\n\n"), `${CONFIG_FILE} does not end with exactly one newline`);
});

Then("no configuration file exists", function (this: OidWorld) {
  assert.ok(!existsSync(this.path(CONFIG_FILE)), `${CONFIG_FILE} exists`);
});

Then("no {string} file exists", function (this: OidWorld, path: string) {
  assert.ok(!existsSync(this.path(path)), `${path} exists`);
});

Then("the file {string} has exactly the lines:", function (this: OidWorld, path: string, table: { raw: () => string[][] }) {
  assert.ok(existsSync(this.path(path)), `${path} does not exist; stdout: ${this.stdout}; stderr: ${this.stderr}`);
  const lines = readFileSync(this.path(path), "utf8").split("\n").filter((line) => line !== "");
  assert.deepEqual(lines, table.raw().map(([line]) => line));
});

Then("the file {string} is unchanged", function (this: OidWorld, path: string) {
  const original = writtenFixtures.get(this)?.get(path);
  assert.notEqual(original, undefined, `no fixture was written for ${path}`);
  assert.equal(readFileSync(this.path(path), "utf8"), original);
});

function importedFeature(world: OidWorld, id: string): Record<string, unknown> {
  const found = world.loadProgress().features.find((f) => f.id === id);
  assert.ok(found, `feature ${id} is not in progress.json`);
  return found as unknown as Record<string, unknown>;
}

Then("the feature {string} has no field {string}", function (this: OidWorld, id: string, field: string) {
  assert.ok(!(field in importedFeature(this, id)), `feature ${id} still has the field ${field}`);
});

Then(
  "the scenario {string} of the feature {string} has no field {string}",
  function (this: OidWorld, name: string, id: string, field: string) {
    const scenario = this.loadProgress().features.find((f) => f.id === id)?.scenarios?.find((s) => s.name === name);
    assert.ok(scenario, `feature ${id} has no scenario "${name}"`);
    assert.ok(!(field in scenario), `scenario "${name}" of ${id} still has the field ${field}`);
  },
);
