import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import type { OidWorld } from "../support/world.js";

/** A help line gives a name, then at least two spaces, then its description. */
function assertDescribed(world: OidWorld, name: string, kind: string): void {
  const escaped = name.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
  const described = new RegExp(`^\\s*${escaped}\\s{2,}\\S`, "m");
  assert.ok(described.test(world.stdout), `no line describes the ${kind} ${name} in:\n${world.stdout}`);
}

Given("an empty project directory", function (this: OidWorld) {
  assert.deepEqual(readdirSync(this.dir), []);
});

Given("an invalid project configuration file", function (this: OidWorld) {
  this.write(".outside-in.json", "{ this is not json\n");
});

Then("the output describes the command {string}", function (this: OidWorld, name: string) {
  assertDescribed(this, name, "command");
});

Then("the output describes the option {string}", function (this: OidWorld, name: string) {
  assertDescribed(this, name, "option");
});

Then("the error output is empty", function (this: OidWorld) {
  assert.equal(this.stderr, "");
});

Then("the output is empty", function (this: OidWorld) {
  assert.equal(this.stdout, "");
});

Then("no project file was changed", function (this: OidWorld) {
  assert.deepEqual([...this.snapshotFiles()], [...this.filesBefore]);
});
