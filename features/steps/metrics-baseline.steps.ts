import { Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import type { OidWorld } from "../support/world.js";

const LEFT_OUT = /^(\d+) existing findings? left out/;
const RECORDED = /^baseline: (\d+) findings? recorded/;

/** The number a line of `output` that matches `pattern` carries, or undefined when no line matches. */
function numberOf(output: string, pattern: RegExp): number | undefined {
  for (const line of output.split("\n")) {
    const match = pattern.exec(line);
    if (match) return Number(match[1]);
  }
  return undefined;
}

Then("the file {string} exists", function (this: OidWorld, path: string) {
  assert.ok(existsSync(this.path(path)), `${path} does not exist; stdout: ${this.stdout}; stderr: ${this.stderr}`);
});

Then("the output says the baseline records {int} findings", function (this: OidWorld, count: number) {
  assert.equal(numberOf(this.stdout, RECORDED), count, `no baseline line for ${count} findings in:\n${this.stdout}`);
});

Then(/^the output says (\d+) existing findings? (?:was|were) left out$/, function (this: OidWorld, count: string) {
  assert.equal(numberOf(this.stdout, LEFT_OUT), Number(count), `no line saying ${count} existing findings were left out in:\n${this.stdout}`);
});

Then("the output does not mention left out findings", function (this: OidWorld) {
  assert.equal(numberOf(this.stdout, LEFT_OUT), undefined, `unexpected left-out line in:\n${this.stdout}`);
});

const BASELINE_FILE = ".outside-in/baseline.json";

function baselineText(world: OidWorld): string {
  assert.ok(existsSync(world.path(BASELINE_FILE)), `${BASELINE_FILE} does not exist; stdout: ${world.stdout}; stderr: ${world.stderr}`);
  return readFileSync(world.path(BASELINE_FILE), "utf8");
}

Then("the baseline file is indented by 2 spaces and holds no escaped text", function (this: OidWorld) {
  const text = baselineText(this);
  assert.ok(text.startsWith('[\n  {\n    "'), `the baseline file is not a 2-space indented list of records:\n${text}`);
  assert.ok(!text.includes("\\"), `the baseline file holds escaped text:\n${text}`);
});

Then("the baseline holds the record:", function (this: OidWorld, record: string) {
  const records = JSON.parse(baselineText(this)) as unknown[];
  assert.ok(
    records.some((candidate) => isDeepStrictEqual(candidate, JSON.parse(record))),
    `no record ${record} in:\n${JSON.stringify(records, null, 2)}`,
  );
});
