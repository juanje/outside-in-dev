import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { existsSync, readFileSync, symlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { OidWorld } from "../support/world.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CHECKPOINT_FILE = ".outside-in/checkpoint.json";
const CHECKPOINTS_DIR = ".outside-in/checkpoints";
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
  commands: { bdd: 'NODE_OPTIONS="--import tsx" node_modules/.bin/cucumber-js', unit: "node_modules/.bin/vitest run", typecheck: "node_modules/.bin/tsc --noEmit", format: null, lint: null, coverage: null, extra_checks: [] },
};

const FIXTURE_TSCONFIG = {
  compilerOptions: { strict: true, module: "NodeNext", moduleResolution: "NodeNext", target: "ES2022", noEmit: true, skipLibCheck: true },
  include: ["src/**/*.ts", "tests/**/*.ts"],
};

/** The checkpoint of the feature in focus, or the single checkpoint when no feature is focused. */
function checkpointFile(world: OidWorld): string {
  const focus = world.loadProgress().current_focus;
  return focus === null ? CHECKPOINT_FILE : `${CHECKPOINTS_DIR}/${focus}.json`;
}

/** The checkpoint of the feature in focus (the single checkpoint with no focus), parsed. */
function readCheckpoint(world: OidWorld): { step: string; external: boolean; snapshot: Record<string, string>; scenarios: { feature: string; name: string }[] } {
  const file = checkpointFile(world);
  assert.ok(existsSync(world.path(file)), `no checkpoint was recorded in ${file}; stdout: ${world.stdout}; stderr: ${world.stderr}`);
  return JSON.parse(readFileSync(world.path(file), "utf8"));
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
  for (const wording of ["containing:", "is changed to:"]) {
    Given(`the ${kind} file {string} ${wording}`, function (this: OidWorld, path: string, content: string) {
      this.write(path, `${content}\n`);
    });
  }
}

Given("the changes are committed", function (this: OidWorld) {
  this.git("add", "-A");
  this.git("commit", "--quiet", "--message", "changes");
});

Then("the command needs a decision", function (this: OidWorld) {
  assert.equal(this.exitCode, NEEDS_A_DECISION, `expected exit code ${NEEDS_A_DECISION}, got ${this.exitCode}; stdout: ${this.stdout}; stderr: ${this.stderr}`);
});

Then("the output starts with {string}", function (this: OidWorld, text: string) {
  assert.ok(this.stdout.startsWith(text), `stdout does not start with "${text}":\n${this.stdout}`);
});

/** The checkpoint file of the Red a scenario recorded in a Given, by world: a later verification must leave it as it was. */
const recordedRed = new WeakMap<OidWorld, { file: string; text: string }>();

Then("no checkpoint is recorded", function (this: OidWorld) {
  const red = recordedRed.get(this);
  if (red !== undefined) {
    assert.equal(readFileSync(this.path(red.file), "utf8"), red.text, "the checkpoint of the Red was replaced");
    return;
  }
  assert.ok(!existsSync(this.path(CHECKPOINT_FILE)) && !existsSync(this.path(CHECKPOINTS_DIR)), "a checkpoint was recorded");
});

Given("a Red of {string} was verified at step {string}", async function (this: OidWorld, id: string, step: string) {
  const { recordVerified, loadVerifyConfig } = await import("../../src/artifacts/verified-checkpoint.js");
  recordVerified(this.dir, loadVerifyConfig(this.dir), { step, verify: { kind: "red", target: "all" }, external: false }, [id]);
  const file = `${CHECKPOINTS_DIR}/${id}.json`;
  recordedRed.set(this, { file, text: readFileSync(this.path(file), "utf8") });
});

Then("the file {string} contains:", function (this: OidWorld, path: string, content: string) {
  assert.equal(readFileSync(this.path(path), "utf8"), `${content}\n`);
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

Then("the checkpoint lists the scenario {string} of {string}", function (this: OidWorld, name: string, feature: string) {
  assert.deepEqual(readCheckpoint(this).scenarios.filter((scenario) => scenario.name === name && scenario.feature === feature), [{ feature, name }]);
});

Then("the checkpoint lists no scenario", function (this: OidWorld) {
  assert.deepEqual(readCheckpoint(this).scenarios, []);
});

/** Records a checkpoint of `id` on the files of the project as they are now, as a verification of `id` would. */
async function recordCheckpointOf(world: OidWorld, id: string | null, step: string, scenarios: { feature: string; name: string }[] = []): Promise<void> {
  const { recordCheckpoint } = await import("../../src/artifacts/checkpoint.js");
  const verify = { kind: step === "tdd_green" ? "green" : "red", target: "all" };
  recordCheckpoint(world.dir, { step, feature: id, verify, external: false, date: new Date(), scenarios });
}

Given("a later green ran the scenario {string} of {string}", async function (this: OidWorld, name: string, id: string) {
  await recordCheckpointOf(this, id, "tdd_green", [{ feature: id, name }]);
});

Given("a verification of {string} at step {string} is recorded", async function (this: OidWorld, id: string, step: string) {
  await recordCheckpointOf(this, id, step);
});

Given("a single checkpoint of {string} at step {string} is recorded", async function (this: OidWorld, id: string, step: string) {
  await recordCheckpointOf(this, null, step);
  this.write(CHECKPOINT_FILE, JSON.stringify({ ...JSON.parse(readFileSync(this.path(CHECKPOINT_FILE), "utf8")), feature: id }));
});

Then("the checkpoint of {string} lists the scenario {string}", function (this: OidWorld, id: string, name: string) {
  const path = this.path(`${CHECKPOINTS_DIR}/${id}.json`);
  assert.ok(existsSync(path), `${id} has no checkpoint; stdout: ${this.stdout}; stderr: ${this.stderr}`);
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")).scenarios, [{ feature: id, name }]);
});

Then("the checkpoint of {string} lists the scenarios {string} and {string}", function (this: OidWorld, id: string, first: string, second: string) {
  const path = this.path(`${CHECKPOINTS_DIR}/${id}.json`);
  assert.ok(existsSync(path), `${id} has no checkpoint; stdout: ${this.stdout}; stderr: ${this.stderr}`);
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")).scenarios, [first, second].map((name) => ({ feature: id, name })));
});

Then("the command prints no stack trace", function (this: OidWorld) {
  assert.doesNotMatch(`${this.stdout}\n${this.stderr}`, /^\s*at .*:\d+:\d+/m);
});
