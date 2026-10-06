import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import type { OidWorld } from "../support/world.js";

Given("a SPEC.md containing:", function (this: OidWorld, content: string) {
  this.write("SPEC.md", content.endsWith("\n") ? content : `${content}\n`);
});

Given("a feature file {string} containing:", function (this: OidWorld, path: string, content: string) {
  this.write(path, content.endsWith("\n") ? content : `${content}\n`);
});

type JsonViolation = { check: string; message: string };
type JsonReport = { ok: boolean; violations: JsonViolation[] };

function parseReport(world: OidWorld): JsonReport {
  return JSON.parse(world.stdout) as JsonReport;
}

Then("the output is a single JSON document", function (this: OidWorld) {
  assert.doesNotThrow(() => JSON.parse(this.stdout), `stdout is not one JSON document:\n${this.stdout}`);
});

Then("the JSON report says ok is {word}", function (this: OidWorld, expected: string) {
  assert.equal(parseReport(this).ok, expected === "true");
});

Then("the JSON report lists no violations", function (this: OidWorld) {
  assert.deepEqual(parseReport(this).violations, []);
});

Then(
  "the JSON report has a {string} violation containing {string}",
  function (this: OidWorld, check: string, text: string) {
    const found = parseReport(this).violations.some((v) => v.check === check && v.message.includes(text));
    assert.ok(found, `no ${check} violation containing "${text}" in:\n${this.stdout}`);
  },
);

Then("every JSON violation message is a line printed by {string}", async function (this: OidWorld, commandLine: string) {
  const violations = parseReport(this).violations;
  const { stdout, stderr, exitCode } = this;
  await this.run(commandLine);
  const lines = this.stdout.split("\n");
  Object.assign(this, { stdout, stderr, exitCode });
  assert.ok(violations.length > 0, "the JSON report has no violations");
  for (const { message } of violations) {
    assert.ok(lines.includes(message), `"${message}" is not a line of the plain output:\n${lines.join("\n")}`);
  }
});

Given("a SPEC.md with {int} requirements sharing one ID", function (this: OidWorld, count: number) {
  const section = "### FR-DUP-01: Same title\n\nThe tool does the same thing.\n\n";
  this.write("SPEC.md", section.repeat(count));
});

const CONFIG_FILE = ".outside-in.json";

type ProjectConfigFixture = { paths: { spec: string; progress: string; bdd_features: string[] } };

function readConfigFixture(world: OidWorld): ProjectConfigFixture {
  return JSON.parse(readFileSync(world.path(CONFIG_FILE), "utf8")) as ProjectConfigFixture;
}

Given(
  "a project configuration with the spec {string}, the progress file {string} and the feature globs {string}",
  function (this: OidWorld, spec: string, progress: string, globs: string) {
    const config = {
      version: 1,
      stack: "typescript",
      paths: {
        source: ["src/**"],
        shared: [],
        unit_tests: ["tests/**"],
        bdd_features: globs.split(",").map((glob) => glob.trim()),
        bdd_steps: [],
        docs: [],
        spec,
        design: [],
        progress,
      },
      commands: { bdd: "bdd", unit: "unit", typecheck: "tsc", format: null, lint: null, coverage: null, extra_checks: [] },
    };
    this.write(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`);
  },
);

Given("the project configuration also lists the feature glob {string}", function (this: OidWorld, glob: string) {
  const config = readConfigFixture(this);
  config.paths.bdd_features.push(glob);
  this.write(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`);
});

Then("the file {string} contains {string}", function (this: OidWorld, path: string, text: string) {
  assert.ok(existsSync(this.path(path)), `${path} does not exist; stdout: ${this.stdout}; stderr: ${this.stderr}`);
  assert.ok(readFileSync(this.path(path), "utf8").includes(text), `${path} does not contain "${text}"`);
});
