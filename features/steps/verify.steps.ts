import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { existsSync, readFileSync, symlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { OidWorld } from "../support/world.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CHECKPOINT_FILE = ".outside-in/checkpoint.json";
const NEEDS_A_DECISION = 2;

const FIXTURE_CONFIG = {
  version: 1,
  stack: "typescript",
  paths: {
    source: ["src/**/*.ts"],
    shared: [],
    unit_tests: ["tests/unit/**/*.test.ts"],
    bdd_features: ["features/**/*.feature"],
    bdd_steps: ["features/steps/**/*.ts"],
    docs: [],
    spec: "SPEC.md",
    design: [],
    progress: "progress.json",
  },
  commands: { bdd: 'NODE_OPTIONS="--import tsx" npx cucumber-js', unit: "npx vitest run", typecheck: "npx tsc --noEmit", format: null, lint: null, coverage: null, extra_checks: [] },
};

const FIXTURE_TSCONFIG = {
  compilerOptions: { strict: true, module: "NodeNext", moduleResolution: "NodeNext", target: "ES2022", noEmit: true, skipLibCheck: true },
  include: ["src/**/*.ts", "tests/**/*.ts"],
};

/** The checkpoint file of the project, parsed. */
function readCheckpoint(world: OidWorld): { step: string; external: boolean; snapshot: Record<string, string>; scenarios: { feature: string; name: string }[] } {
  assert.ok(existsSync(world.path(CHECKPOINT_FILE)), `no checkpoint was recorded; stdout: ${world.stdout}; stderr: ${world.stderr}`);
  return JSON.parse(readFileSync(world.path(CHECKPOINT_FILE), "utf8"));
}

/** Writes a minimal TypeScript project with oid's configuration and oid's own dependencies linked in. */
function writeProject(world: OidWorld): void {
  world.write("package.json", `${JSON.stringify({ name: "fixture", private: true, type: "module" }, null, 2)}\n`);
  world.write("tsconfig.json", `${JSON.stringify(FIXTURE_TSCONFIG, null, 2)}\n`);
  world.write(".outside-in.json", `${JSON.stringify(FIXTURE_CONFIG, null, 2)}\n`);
  world.write(".gitignore", "node_modules\n.outside-in\n");
  symlinkSync(resolve(REPO_ROOT, "node_modules"), world.path("node_modules"), "dir");
}

Given("a TypeScript project with unit tests", function (this: OidWorld) {
  writeProject(this);
});

Given("a TypeScript project with BDD scenarios", function (this: OidWorld) {
  writeProject(this);
  this.write("cucumber.mjs", `export default { import: ["features/steps/**/*.ts"] };\n`);
});

for (const kind of ["source", "unit test", "feature", "step definitions"]) {
  Given(`the ${kind} file {string} containing:`, function (this: OidWorld, path: string, content: string) {
    this.write(path, `${content}\n`);
  });
}

Given("the source file {string} is changed to:", function (this: OidWorld, path: string, content: string) {
  this.write(path, `${content}\n`);
});

Then("the command needs a decision", function (this: OidWorld) {
  assert.equal(this.exitCode, NEEDS_A_DECISION, `expected exit code ${NEEDS_A_DECISION}, got ${this.exitCode}; stdout: ${this.stdout}; stderr: ${this.stderr}`);
});

Then("the output starts with {string}", function (this: OidWorld, text: string) {
  assert.ok(this.stdout.startsWith(text), `stdout does not start with "${text}":\n${this.stdout}`);
});

Then("no checkpoint is recorded", function (this: OidWorld) {
  assert.ok(!existsSync(this.path(CHECKPOINT_FILE)), "a checkpoint was recorded");
});

Then("the checkpoint records the step {string}", function (this: OidWorld, step: string) {
  assert.equal(readCheckpoint(this).step, step);
});

Then("the checkpoint records an external decision", function (this: OidWorld) {
  assert.equal(readCheckpoint(this).external, true);
});

Then("the checkpoint lists the file {string}", function (this: OidWorld, path: string) {
  assert.ok(path in readCheckpoint(this).snapshot, `the checkpoint does not list ${path}`);
});

When("I run the built {string}", function (this: OidWorld, commandLine: string) {
  this.runBuilt(commandLine);
});

Then("the checkpoint lists the scenario {string} of {string}", function (this: OidWorld, name: string, feature: string) {
  assert.deepEqual(readCheckpoint(this).scenarios.filter((scenario) => scenario.name === name && scenario.feature === feature), [{ feature, name }]);
});

Then("the checkpoint lists no scenario", function (this: OidWorld) {
  assert.deepEqual(readCheckpoint(this).scenarios, []);
});
