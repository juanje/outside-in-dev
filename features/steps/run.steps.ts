import { After, Before, Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EXISTING_UNIT_TEST, TSCONFIG } from "../support/cart-files.js";
import { FakeAgent } from "../support/fake-agent.js";
import { detectorOf } from "../support/fake-detector.js";
import { REAL_RUNNER_SCENARIOS } from "../support/real-runners.js";
import { git, runWorktree, worktrees } from "../support/run-project.js";
import { commitKey, restoreTemplate, saveTemplate } from "../support/template-repo.js";
import type { OidWorld } from "../support/world.js";

type Status = "done" | "pending" | "in progress";
type Suite = { unitFailing: string[]; bddFailing: string[]; printFailed: boolean; reportLock: string | null; unitExit: number; unitWritesReport: boolean; bddExit: number };
/** The project that runs its scenarios with cucumber: the scenario of the feature that is done and passing, and the recorded report the BDD command replays for the gate run (`DEFAULT_REPLAY` unless the step says otherwise). */
type Cucumber = { feature: string; scenario: string; replay: string | string[]; loop?: Loop; limit?: number; suite?: string[] };
/** The tools of the quality gate a project has: scripts that behave like the formatter and the linter oid recognises by name, and an extra check that fails. */
export type Tools = { format: boolean; lint: boolean; extraCheck?: string };
/** The unit tests and the type check of a project that runs the inner loop: the recorded vitest reports its unit command replays in order (the first is the baseline run), and the recorded type check output, if any. */
export type Loop = { unit: string[]; typecheck: string | null | (string | null)[] };
type Fixture = { requirements: string[]; tracked: Map<string, Status>; suite: Suite; config: boolean; cucumber?: Cucumber; tools: Tools };
export type LoggedEvent = { type: string; to?: string; reason?: string; message?: string; file?: string; from?: string };
export type SavedSession = { runId: string; worktree: string; branch: string; baseCommit: string; state: string; targetFrs?: string[]; featureHashes?: Record<string, string>; pendingInput?: { id: string; prompt: string; actions: { key: string }[] } | null };

const fixtures = new WeakMap<OidWorld, Fixture>();
const lockPaths = new WeakMap<OidWorld, string>();
/** Where each scenario's fixture repository stands: the key of its last commit, and whether `git init` is still to be done (it is skipped when a template stands in for it). */
const history = new WeakMap<OidWorld, { key: string; initialised: boolean }>();
/** The processes a scenario started to hold the lock; they are stopped when the scenario ends. */
const holders = new WeakMap<OidWorld, ChildProcess>();
const LOCK = ".outside-in/lock";
export const SESSION = ".outside-in/session.json";
export const PROJECT = "project";
const FIXTURE_PATHS = { source: ["src/**"], shared: [], unit_tests: [], bdd_features: ["features/**/*.feature"], bdd_steps: [], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" };
const FIXTURE_COMMANDS = { bdd: "node bdd.mjs", unit: "node unit.mjs", typecheck: "t", format: null, lint: null, coverage: null, extra_checks: [] };
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CUCUMBER_PATHS = { ...FIXTURE_PATHS, unit_tests: ["tests/unit/**/*.ts"], bdd_steps: ["features/steps/**/*.ts"] };
const CUCUMBER_COMMANDS = { ...FIXTURE_COMMANDS, bdd: 'NODE_OPTIONS="--import tsx" node_modules/.bin/cucumber-js' };
/** The replay scripts are plain JavaScript: the commands clear the NODE_OPTIONS that the cucumber run sets (`--import tsx`), which would make each of them load the TypeScript loader for nothing. */
const REPLAY_NODE = "NODE_OPTIONS= node";
const REPLAY_COMMANDS = { ...FIXTURE_COMMANDS, bdd: `${REPLAY_NODE} bdd-replay.mjs` };
const EXTRA_CHECK_FILE = "extra-check.mjs";
const SUPPORT = join(REPO_ROOT, "features", "support");
const BASELINE_REPLAY = "baseline-green";
const GATE_UNIT_REPORT = "unit-green";
export const DEFAULT_REPLAY = "missing-implementation";
const REAL_UNIT_COMMAND = "node_modules/.bin/vitest run";
const REAL_TYPECHECK_COMMAND = "node_modules/.bin/tsc --noEmit";
const realRunner = new WeakSet<OidWorld>();
const STATUS_FIELDS: Record<Status, object> = { done: { status: "done" }, pending: { status: "pending" }, "in progress": { status: "in_progress", cycle_step: "bdd_red" } };

/** The unit runner of the fixture: writes a vitest JSON report from `suite.json`, plus a marker, and records the lock it finds when asked. */
const UNIT_RUNNER = `import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
const suite = JSON.parse(readFileSync("suite.json", "utf8"));
const output = process.argv.find((arg) => arg.startsWith("--outputFile=")).slice("--outputFile=".length);
writeFileSync("ran-unit.txt", "ran\\n");
if (!suite.unitWritesReport) process.exit(suite.unitExit);
if (suite.printFailed) console.log("1 failed");
if (suite.reportLock !== null) {
  const parent = (pid) => Number(readFileSync("/proc/" + pid + "/stat", "utf8").replace(/^.*\\) \\S+ /, "").split(" ")[0]);
  const chain = [process.ppid, parent(process.ppid)];
  writeFileSync(suite.reportLock, JSON.stringify({ lock: readFileSync(suite.lockFile, "utf8").trim(), chain }));
}
const test = (fullName, failed) => ({ fullName, title: fullName.split(" > ").pop(), status: failed ? "failed" : "passed", failureMessages: failed ? ["boom"] : [] });
const names = ["totals > starts at zero", ...suite.unitFailing];
const tests = names.map((name) => test(name, suite.unitFailing.includes(name)));
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify({ testResults: [{ name: process.cwd() + "/tests/unit/totals.test.ts", message: "", assertionResults: tests }] }));
process.exitCode = suite.unitExit;
`;

/** The BDD runner of the fixture: writes a Cucumber Messages report from `suite.json`, plus a marker. */
const BDD_RUNNER = `import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
const suite = JSON.parse(readFileSync("suite.json", "utf8"));
const output = process.argv[process.argv.indexOf("--format") + 1].slice("message:".length);
writeFileSync("ran-bdd.txt", "ran\\n");
const names = ["Add to cart", ...suite.bddFailing];
const lines = names.flatMap((name, at) => {
  const failed = suite.bddFailing.includes(name);
  return [
    { pickle: { id: "p" + at, uri: "features/cart.feature", name, steps: [{ id: "ps" + at, text: "a step" }] } },
    { testCase: { id: "c" + at, pickleId: "p" + at, testSteps: [{ id: "s" + at, pickleStepId: "ps" + at }] } },
    { testCaseStarted: { id: "r" + at, testCaseId: "c" + at } },
    { testStepFinished: { testCaseStartedId: "r" + at, testStepId: "s" + at, testStepResult: failed ? { status: "FAILED", message: "boom" } : { status: "PASSED" } } },
  ];
});
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, lines.map((line) => JSON.stringify(line)).join("\\n") + "\\n");
process.exitCode = suite.bddExit;
`;

/** A script that behaves like ESLint for the flags oid appends: it reports every TODO comment of `src` (as ESLint JSON with `--format json`) and fixes nothing. */
const ESLINT_TOOL = `import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
const files = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : name.endsWith(".ts") ? [join(dir, name)] : []));
const results = files("src").map((file) => ({ filePath: resolve(file), messages: readFileSync(file, "utf8").split("\\n").flatMap((line, at) => (line.includes("TODO") ? [{ ruleId: "no-todo", severity: 2, message: "Unexpected TODO comment.", line: at + 1, column: 1 }] : [])) }));
const failed = results.some((result) => result.messages.length > 0);
const args = process.argv.slice(2);
if (args.includes("--format") && args[args.indexOf("--format") + 1] === "json") console.log(JSON.stringify(results));
process.exit(failed ? 1 : 0);
`;

/** A script that behaves like Prettier for the flags oid appends: `--write` removes the trailing spaces of `src`, `--check` lists the files that have some and fails. */
const PRETTIER_TOOL = `import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const files = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : name.endsWith(".ts") ? [join(dir, name)] : []));
const untidy = files("src").filter((file) => / +$/m.test(readFileSync(file, "utf8")));
if (process.argv.includes("--write")) for (const file of untidy) writeFileSync(file, readFileSync(file, "utf8").replace(/ +$/gm, ""));
if (process.argv.includes("--check")) for (const file of untidy) console.log("[warn] " + file);
process.exit(process.argv.includes("--check") && untidy.length > 0 ? 1 : 0);
`;

/** The files of a project whose passing scenario runs with cucumber, with the steps of that scenario and a source file to reuse. */
function cucumberFiles({ feature, scenario }: Cucumber): Record<string, string> {
  return {
    "package.json": `${JSON.stringify({ name: "fixture", private: true, type: "module" })}\n`,
    "package-lock.json": "{}\n",
    "cucumber.mjs": `export default { import: ["features/steps/**/*.ts"] };\n`,
    [`features/${feature}.feature`]: `@${feature}\nFeature: Cart\n  Scenario: ${scenario}\n    Given a cart\n    When a product is added\n    Then the cart is not empty\n`,
    "features/steps/cart.steps.ts": `import { Given, Then, When } from "@cucumber/cucumber";\nGiven("a cart", function () {});\nWhen("a product is added", function () {});\nThen("the cart is not empty", function () {});\n`,
    "src/lines.ts": "/** Counts the lines of a cart. */\nexport function countLines(lines: string[]): number {\n  const bodyMarker = lines.length;\n  return bodyMarker;\n}\n",
  };
}

/** The replay files and scripts of one runner: the script, the library it imports and the recordings its entries name. */
function writeReplayScripts(world: OidWorld, script: string, as: string): void {
  writeIn(world, "replay-lib.mjs", readFileSync(join(SUPPORT, "replay-lib.mjs"), "utf8"));
  writeIn(world, as, readFileSync(join(SUPPORT, script), "utf8"));
}

/** An entry of a replay sequence: the recording it answers with, the request it answers, and whether it answers every later identical call. */
type ReplayEntry = { recording: string | null; expect?: unknown; repeat?: true };
const SUITE = "suite";

/** The scenarios a recorded report ran (its pickles that have a test case started), as `file:line`: the locations of the call it answers. */
function locationsOf(recording: string): string[] {
  const messages = readFileSync(join(SUPPORT, "recorded", `${recording}.ndjson`), "utf8").split("\n").filter((line) => line !== "").map((line) => JSON.parse(line) as { pickle?: { id: string; uri: string; location: { line: number } }; testCase?: { id: string; pickleId: string } });
  const pickles = new Map(messages.flatMap(({ pickle }) => (pickle === undefined ? [] : [[pickle.id, pickle] as const])));
  const ran = new Set(messages.flatMap(({ testCase }) => (testCase === undefined ? [] : [testCase.pickleId])));
  return [...ran].map((id) => `${pickles.get(id)!.uri}:${pickles.get(id)!.location.line}`);
}

/** The fake BDD runner of the project and the recordings it replays, in the order of the calls: the start of the run (the whole suite), the runs of the scenarios the gate asks for, each expecting the locations of the scenarios its recording ran, and the whole suite again at the end. */
function writeReplay(world: OidWorld, gate: string | string[], suite: string[] = []): void {
  const exitCodes = JSON.parse(readFileSync(join(SUPPORT, "recorded", "exit-codes.json"), "utf8")) as Record<string, number>;
  const suites = suite.length === 0 ? [BASELINE_REPLAY] : [BASELINE_REPLAY, ...suite];
  const whole = (recording: string): ReplayEntry => ({ recording, expect: SUITE });
  const finals = suites.length === 1 ? suites : suites.slice(1);
  const sequence: ReplayEntry[] = [whole(suites[0]!), ...[gate].flat().map((recording) => ({ recording, expect: { locations: locationsOf(recording) } })), ...finals.map(whole)];
  sequence[sequence.length - 1]!.repeat = true;
  writeReplayScripts(world, "replay-bdd.mjs", "bdd-replay.mjs");
  writeIn(world, "replay/replay.json", JSON.stringify({ sequence, exitCodes }));
  for (const name of new Set([BASELINE_REPLAY, ...suite, ...[gate].flat()])) writeIn(world, `replay/${name}.ndjson`, readFileSync(join(SUPPORT, "recorded", `${name}.ndjson`), "utf8"));
}

/** The fake unit runner and type check of the project and the recordings they replay. */
function writeLoopReplay(world: OidWorld, { unit, typecheck }: Loop): void {
  const exitCodes = JSON.parse(readFileSync(join(SUPPORT, "recorded", "exit-codes.json"), "utf8")) as Record<string, number>;
  writeReplayScripts(world, "replay-unit.mjs", "unit-replay.mjs");
  writeIn(world, "typecheck-replay.mjs", readFileSync(join(SUPPORT, "replay-typecheck.mjs"), "utf8"));
  // The full unit run of the quality gate follows the runs of the loop; unless a scenario scripts it, it passes, and so on for as many runs as it makes.
  const units: ReplayEntry[] = [...unit.map((recording) => ({ recording, expect: SUITE })), { recording: GATE_UNIT_REPORT, expect: SUITE, repeat: true }];
  writeIn(world, "replay/unit.json", JSON.stringify({ sequence: units, exitCodes }));
  // The type check of the start of the run comes before the runs of the loop. A recording given alone answers every call.
  const checks: ReplayEntry[] = Array.isArray(typecheck) ? [{ recording: null }, ...typecheck.map((recording) => ({ recording }))] : [{ recording: typecheck, repeat: true }];
  writeIn(world, "replay/typecheck.json", JSON.stringify({ sequence: checks, exitCodes }));
  for (const name of new Set([...unit, GATE_UNIT_REPORT])) writeIn(world, `replay/${name}.json`, readFileSync(join(SUPPORT, "recorded", `${name}.json`), "utf8"));
  for (const name of new Set([typecheck].flat())) if (name !== null) writeIn(world, `replay/${name}.txt`, readFileSync(join(SUPPORT, "recorded", `${name}.txt`), "utf8"));
}

export function fixtureOf(world: OidWorld): Fixture {
  const found = fixtures.get(world);
  assert.ok(found, "no project was created");
  return found;
}

export function writeIn(world: OidWorld, name: string, content: string): void {
  mkdirSync(dirname(world.path(join(PROJECT, name))), { recursive: true });
  writeFileSync(world.path(join(PROJECT, name)), content);
}

/** Writes the whole fixture project from its description and commits it. */
export function commit(world: OidWorld): void {
  const fixture = fixtureOf(world);
  const specs = fixture.requirements.map((id) => `### ${id}: Feature ${id}\n\nIt does what ${id} says.\n`);
  writeIn(world, "SPEC.md", `# Spec\n\n## Functional Requirements\n\n${specs.join("\n")}`);
  const passing = fixture.cucumber === undefined ? {} : { scenarios: [{ name: fixture.cucumber.scenario, bdd: "pass" }] };
  const features = [...fixture.tracked].map(([id, status]) => ({ id, title: `Feature ${id}`, ...STATUS_FIELDS[status], ...(id === fixture.cucumber?.feature ? passing : {}) }));
  writeIn(world, "progress.json", `${JSON.stringify({ current_focus: null, features })}\n`);
  // The lock path is read only by a runner that reports the lock; leaving it out elsewhere keeps the committed project the same in every scenario's directory.
  writeIn(world, "suite.json", JSON.stringify(fixture.suite.reportLock === null ? fixture.suite : { ...fixture.suite, lockFile: join(world.dir, PROJECT, LOCK) }));
  writeIn(world, "unit.mjs", UNIT_RUNNER);
  writeIn(world, "bdd.mjs", BDD_RUNNER);
  const { loop, limit } = fixture.cucumber ?? {};
  const realLoop = loop !== undefined && realRunner.has(world);
  const bddCommands = fixture.cucumber === undefined ? FIXTURE_COMMANDS : realRunner.has(world) ? CUCUMBER_COMMANDS : REPLAY_COMMANDS;
  const loopCommands = loop === undefined ? bddCommands : { ...bddCommands, unit: realLoop ? REAL_UNIT_COMMAND : `${REPLAY_NODE} unit-replay.mjs`, typecheck: realLoop ? REAL_TYPECHECK_COMMAND : `${REPLAY_NODE} typecheck-replay.mjs` };
  const { format, lint, extraCheck } = fixture.tools;
  const commands = { ...loopCommands, format: format ? "node prettier.mjs" : null, lint: lint ? "node eslint.mjs" : null, extra_checks: extraCheck === undefined ? [] : [`node ${EXTRA_CHECK_FILE}`] };
  if (format) writeIn(world, "prettier.mjs", PRETTIER_TOOL);
  if (lint) writeIn(world, "eslint.mjs", ESLINT_TOOL);
  if (extraCheck !== undefined) writeIn(world, EXTRA_CHECK_FILE, `console.log(${JSON.stringify(extraCheck)});\nprocess.exit(1);\n`);
  const config = { version: 1, stack: "typescript", paths: fixture.cucumber ? CUCUMBER_PATHS : FIXTURE_PATHS, commands, ...(limit === undefined ? {} : { limits: { max_inner_iterations: limit } }) };
  if (fixture.cucumber) {
    for (const [name, content] of Object.entries(cucumberFiles(fixture.cucumber))) writeIn(world, name, content);
    if (bddCommands === REPLAY_COMMANDS) writeReplay(world, fixture.cucumber.replay, fixture.cucumber.suite);
    if (loop !== undefined) {
      writeIn(world, "tests/unit/cart.test.ts", EXISTING_UNIT_TEST);
      writeIn(world, "tsconfig.json", TSCONFIG);
      if (!realLoop) writeLoopReplay(world, loop);
    }
    writeIn(world, ".gitignore", ".outside-in/\nran-*.txt\nnode_modules\n");
    if (!existsSync(world.path(join(PROJECT, "node_modules")))) symlinkSync(resolve(REPO_ROOT, "node_modules"), world.path(join(PROJECT, "node_modules")), "dir");
  }
  if (fixture.config) writeIn(world, ".outside-in.json", JSON.stringify(config));
  const removesConfig = !fixture.config && existsSync(world.path(join(PROJECT, ".outside-in.json")));
  const past = history.get(world) ?? { key: "", initialised: true };
  const key = commitKey(past.key, world.projectDir, String(removesConfig));
  if (restoreTemplate(key, world.projectDir)) {
    history.set(world, { key, initialised: true });
    return;
  }
  if (!past.initialised) initRepository(world.projectDir);
  if (removesConfig) git(world.projectDir, "rm", "--quiet", "--force", ".outside-in.json");
  git(world.projectDir, "add", "-A");
  git(world.projectDir, "commit", "--quiet", "--allow-empty", "--message", "fixture");
  saveTemplate(key, world.projectDir);
  history.set(world, { key, initialised: true });
}

function initRepository(dir: string): void {
  git(dir, "init", "--quiet", "--initial-branch", "main");
  git(dir, "config", "user.name", "Fixture");
  git(dir, "config", "user.email", "fixture@example.com");
  git(dir, "config", "gc.auto", "0");
  git(dir, "config", "maintenance.auto", "false");
}

export function change(world: OidWorld, update: (fixture: Fixture) => void): void {
  update(fixtureOf(world));
  commit(world);
}

Before({ tags: "@FR-RUN-03" }, function (this: OidWorld, { pickle }) {
  if (pickle.name === REAL_RUNNER_SCENARIOS["FR-RUN-03"]) realRunner.add(this);
});

Before({ tags: "@FR-RUN-04" }, function (this: OidWorld, { pickle }) {
  if (pickle.name === REAL_RUNNER_SCENARIOS["FR-RUN-04"]) realRunner.add(this);
});

Before({ tags: "@FR-RUN-05" }, function (this: OidWorld, { pickle }) {
  if (pickle.name === REAL_RUNNER_SCENARIOS["FR-RUN-05"]) realRunner.add(this);
});

Before({ tags: "@FR-RUN-06" }, function (this: OidWorld, { pickle }) {
  if (pickle.name === REAL_RUNNER_SCENARIOS["FR-RUN-06"]) realRunner.add(this);
});

Before({ tags: "@FR-RUN-01 and @process" }, function (this: OidWorld) {
  this.built = true;
});

/** The scenarios that reach feature writing run in this process, with the scripted agent and no terminal to answer the review. */
Before({ tags: "@FR-RUN-01 and not @process" }, function (this: OidWorld) {
  this.services = { sdk: new FakeAgent().sdk, input: { isTTY: false }, pid: process.pid, agentDir: this.path("agent"), detect: detectorOf(this).detect };
});

Given("a git project with a green suite", function (this: OidWorld) {
  this.projectDir = this.path(PROJECT);
  mkdirSync(this.projectDir, { recursive: true });
  history.set(this, { key: "", initialised: false });
  writeIn(this, ".gitignore", ".outside-in/\nran-*.txt\n");
  writeIn(this, "README.md", "# Project\n");
  writeIn(this, "src/totals.ts", "export const cartSourceMarker = 1;\n");
  writeIn(this, "tests/unit/cart.test.ts", "// cart-test-marker\n");
  fixtures.set(this, { requirements: [], tracked: new Map(), suite: { unitFailing: [], bddFailing: [], printFailed: false, reportLock: null, unitExit: 0, unitWritesReport: true, bddExit: 0 }, config: true, tools: { format: false, lint: false } });
  commit(this);
});

Given(/^SPEC\.md has the requirements (.+)$/, function (this: OidWorld, list: string) {
  change(this, (fixture) => (fixture.requirements = [...list.matchAll(/"([^"]+)"/g)].map((match) => match[1]!)));
});

Given(/^progress\.json tracks (".+)$/, function (this: OidWorld, text: string) {
  change(this, (fixture) => {
    for (const [, ids, status] of text.matchAll(/((?:"[^"]+"(?:, | and )?)+) as (done|pending|in progress)/g)) {
      for (const [, id] of ids!.matchAll(/"([^"]+)"/g)) fixture.tracked.set(id!, status as Status);
    }
  });
});

Given("progress.json tracks no pending feature", function (this: OidWorld) {
  change(this, (fixture) => {
    for (const [id, status] of fixture.tracked) if (status === "pending") fixture.tracked.set(id, "done");
  });
});

Given("the user's copy has an uncommitted change to {string}", function (this: OidWorld, file: string) {
  writeIn(this, file, "# Project, edited\n");
});

Given("a unit test {string} fails in the suite", function (this: OidWorld, name: string) {
  change(this, (fixture) => fixture.suite.unitFailing.push(name));
});

Given("a scenario {string} fails in the suite", function (this: OidWorld, name: string) {
  change(this, (fixture) => fixture.suite.bddFailing.push(name));
});

Given("the unit runner prints {string} and writes a report where every test passed", function (this: OidWorld, text: string) {
  assert.equal(text, "1 failed");
  change(this, (fixture) => (fixture.suite.printFailed = true));
});

Given("the unit runner writes a report where every test passed and exits with code {int}", function (this: OidWorld, code: number) {
  change(this, (fixture) => (fixture.suite.unitExit = code));
});

Given("the BDD runner writes a report where every scenario passed and exits with code {int}", function (this: OidWorld, code: number) {
  change(this, (fixture) => (fixture.suite.bddExit = code));
});

Given("the unit runner writes no report and exits with code {int}", function (this: OidWorld, code: number) {
  change(this, (fixture) => Object.assign(fixture.suite, { unitExit: code, unitWritesReport: false }));
});

Given("the unit runner reports the content of the lock", function (this: OidWorld) {
  change(this, (fixture) => (fixture.suite.reportLock = join(this.dir, "lock-seen.json")));
});

Given("the project has no {string}", function (this: OidWorld, file: string) {
  assert.equal(file, ".outside-in.json");
  change(this, (fixture) => (fixture.config = false));
});

Given("a saved session of an earlier run with a pending question", function (this: OidWorld) {
  const request = { id: "old", prompt: "Old question?", actions: [{ key: "approve", label: "approve" }] };
  writeIn(this, SESSION, JSON.stringify({ runId: "earlier-run", state: "BASELINE", pendingInput: request }));
});

function holdLock(world: OidWorld, pid: number): void {
  writeIn(world, LOCK, `${pid}\n`);
  lockPaths.set(world, String(pid));
}

Given("the lock of the project is held by a process that is running", function (this: OidWorld) {
  const holder = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  assert.ok(holder.pid);
  holders.set(this, holder);
  holdLock(this, holder.pid);
});

After({ tags: "@FR-RUN-01" }, function (this: OidWorld) {
  holders.get(this)?.kill();
});

Given("the lock of the project is held by a process that is no longer running", function (this: OidWorld) {
  const finished = spawnSync(process.execPath, ["-e", ""]);
  assert.ok(finished.pid);
  holdLock(this, finished.pid);
});

export function eventLog(world: OidWorld): LoggedEvent[] {
  const log = join(runDirectory(world), "events.jsonl");
  return readFileSync(log, "utf8").trimEnd().split("\n").map((line) => JSON.parse(line) as LoggedEvent);
}

export function runDirectory(world: OidWorld): string {
  const runs = world.path(join(PROJECT, ".outside-in", "runs"));
  assert.ok(existsSync(runs), "the run left no run directory");
  const names = readdirSync(runs);
  assert.equal(names.length, 1, `expected one run directory, found ${names.join(", ")}`);
  return join(runs, names[0]!);
}

export function transitions(world: OidWorld): LoggedEvent[] {
  return eventLog(world).filter((event) => event.type === "state_change");
}

export function session(world: OidWorld): SavedSession {
  return JSON.parse(readFileSync(world.path(join(PROJECT, SESSION)), "utf8")) as SavedSession;
}

Then("the event log of the run starts with the transitions to {string}, {string}, {string}, {string} and {string}, in that order", function (this: OidWorld, a: string, b: string, c: string, d: string, e: string) {
  assert.deepEqual(transitions(this).map((event) => event.to).slice(0, 5), [a, b, c, d, e]);
});

function transitionInto(world: OidWorld, state: string): LoggedEvent {
  const found = transitions(world).find((event) => event.to === state);
  assert.ok(found, `no transition to ${state}`);
  return found;
}

Then("the transition to {string} says it selected {string} and {string}, in that order", function (this: OidWorld, state: string, first: string, second: string) {
  const reason = transitionInto(this, state).reason ?? "";
  assert.ok(reason.includes(first) && reason.indexOf(first) < reason.indexOf(second), `the reason was: ${reason}`);
});

Then("the transition to {string} says it selected {string}", function (this: OidWorld, state: string, id: string) {
  const reason = transitionInto(this, state).reason ?? "";
  assert.ok(reason.includes(`selected ${id}`), `the reason was: ${reason}`);
  assert.equal(reason.match(/FR-CART-\d+/g)?.length, 1, `the reason was: ${reason}`);
});

Then("a line printed says the start finished and the selected features wait for feature writing", function (this: OidWorld) {
  assert.ok(this.stdout.split("\n").some((line) => /start finished/.test(line) && /wait for feature writing/.test(line)), this.stdout);
});

Then("the output has as many lines as the event log of the run has events", function (this: OidWorld) {
  assert.equal(this.stdout.trimEnd().split("\n").length, eventLog(this).length);
});

Then("no line of the output mentions {string}", function (this: OidWorld, text: string) {
  assert.ok(this.stdout !== "");
  assert.ok(!this.stdout.includes(text), this.stdout);
});

Then("the project has a worktree outside the project directory, on a branch starting with {string}", function (this: OidWorld, prefix: string) {
  const created = runWorktree(this);
  assert.ok(!created.path.startsWith(`${realpathSync(this.projectDir)}/`));
  assert.ok(created.branch.startsWith(prefix), created.branch);
});

Then("the project has a worktree outside the project directory, on the branch {string}", function (this: OidWorld, branch: string) {
  const created = runWorktree(this);
  assert.ok(!created.path.startsWith(`${realpathSync(this.projectDir)}/`));
  assert.equal(created.branch, branch);
});

Then("the user's copy is on its own branch, at its own commit, with only that uncommitted change", function (this: OidWorld) {
  assert.equal(git(this.projectDir, "branch", "--show-current"), "main");
  assert.equal(git(this.projectDir, "log", "-1", "--format=%s"), "fixture");
  assert.equal(git(this.projectDir, "status", "--porcelain"), "M README.md");
});

Then("both suite commands ran in the worktree and not in the user's copy", function (this: OidWorld) {
  const created = runWorktree(this);
  for (const marker of ["ran-unit.txt", "ran-bdd.txt"]) {
    assert.ok(existsSync(join(created.path, marker)), `${marker} is missing from the worktree`);
    assert.ok(!existsSync(this.path(join(PROJECT, marker))), `${marker} was written in the user's copy`);
  }
});

function baseline(world: OidWorld): { startCommit: string; unit: { failed: string[] }; bdd: { failed: string[] } } {
  return JSON.parse(readFileSync(join(runDirectory(world), "baseline.json"), "utf8"));
}

Then("the baseline of the run records the commit the run started from", function (this: OidWorld) {
  assert.equal(baseline(this).startCommit, git(this.projectDir, "rev-parse", "HEAD"));
});

Then("the baseline of the run records no failing unit test and no failing scenario", function (this: OidWorld) {
  const recorded = baseline(this);
  assert.deepEqual([recorded.unit.failed, recorded.bdd.failed], [[], []]);
});

Then("the reports of the suite run are kept in the run directory", function (this: OidWorld) {
  const kept = readdirSync(join(runDirectory(this), "tests"));
  assert.ok(kept.some((name) => name.endsWith("-unit.json")), kept.join(", "));
  assert.ok(kept.some((name) => name.endsWith("-bdd.ndjson")), kept.join(", "));
});

Then("the output asks about the red suite, with the actions {string}, {string} and {string}", function (this: OidWorld, first: string, second: string, third: string) {
  const line = this.stdout.split("\n").find((candidate) => candidate.startsWith("waiting for input"));
  assert.ok(line, this.stdout);
  assert.match(line, /red/);
  for (const action of [first, second, third]) assert.ok(line.includes(action), line);
});

Then("the baseline of the run lists the failing unit test {string}", function (this: OidWorld, name: string) {
  assert.ok(baseline(this).unit.failed.some((entry) => entry.includes(name)), JSON.stringify(baseline(this)));
});

Then("the question about the red suite says {string}", function (this: OidWorld, text: string) {
  const line = this.stdout.split("\n").find((candidate) => candidate.startsWith("waiting for input"));
  assert.ok(line?.includes(text), this.stdout);
});

Then("the baseline of the run lists the problem {string}", function (this: OidWorld, problem: string) {
  const { unit, bdd } = baseline(this);
  assert.ok([...unit.failed, ...bdd.failed].includes(problem), JSON.stringify({ unit, bdd }));
});

Then("the baseline of the run lists the failing scenario {string}", function (this: OidWorld, name: string) {
  assert.ok(baseline(this).bdd.failed.some((entry) => entry.includes(name)), JSON.stringify(baseline(this)));
});

Then("no feature is selected", function (this: OidWorld) {
  const states = transitions(this).map((event) => event.to);
  assert.ok(!states.includes("FEATURE_WRITE"), states.join(", "));
  assert.equal(session(this).targetFrs, undefined);
});

Then("the saved session names the run, its worktree and branch, the commit it started from and the state {string}", function (this: OidWorld, state: string) {
  const saved = session(this);
  const created = runWorktree(this);
  assert.equal(saved.runId, runDirectory(this).split("/").at(-1));
  assert.equal(realpathSync(saved.worktree), realpathSync(created.path));
  assert.equal(saved.branch, created.branch);
  assert.equal(saved.baseCommit, git(this.projectDir, "rev-parse", "HEAD"));
  assert.equal(saved.state, state);
});

Then("the saved session holds the pending question about the red suite", function (this: OidWorld) {
  const pending = session(this).pendingInput;
  assert.ok(pending);
  assert.match(pending.prompt, /red/);
  assert.deepEqual(pending.actions.map((action) => action.key), ["view", "continue", "abort"]);
});

Then("the saved session lists the target features {string} and {string}", function (this: OidWorld, first: string, second: string) {
  assert.deepEqual(session(this).targetFrs, [first, second]);
});

Then("the saved session lists the target features {string}", function (this: OidWorld, id: string) {
  assert.deepEqual(session(this).targetFrs, [id]);
});

Then("the saved session names the new run and not the earlier one", function (this: OidWorld) {
  const saved = session(this);
  assert.notEqual(saved.runId, "earlier-run");
  assert.equal(saved.runId, runDirectory(this).split("/").at(-1));
});

Then("the saved session holds no pending question", function (this: OidWorld) {
  assert.equal(session(this).pendingInput ?? null, null);
});

Then("the saved session holds no pending question of the earlier run", function (this: OidWorld) {
  assert.notEqual(session(this).pendingInput?.id, "old");
});

Then("the output says {string} is not in SPEC.md", function (this: OidWorld, id: string) {
  assert.ok(this.stdout.includes(`${id} is not in SPEC.md`), this.stdout);
});

Then("the output says {string} is not tracked in progress.json", function (this: OidWorld, id: string) {
  assert.ok(this.stdout.includes(`${id} is not tracked in progress.json`), this.stdout);
});

Then("the output says {string} is not pending", function (this: OidWorld, id: string) {
  assert.ok(this.stdout.includes(`${id} is not pending`), this.stdout);
});

Then("the output says there are no pending features", function (this: OidWorld) {
  assert.ok(this.stdout.includes("no pending features"), this.stdout);
});

Then("the event log of the run records an error mentioning {string}", function (this: OidWorld, text: string) {
  const errors = eventLog(this).filter((event) => event.type === "error");
  assert.ok(errors.some((event) => event.message?.includes(text)), JSON.stringify(errors));
});

Then("the error mentions the lock and the process that holds it", function (this: OidWorld) {
  assert.ok(this.stderr.includes(LOCK), this.stderr);
  assert.ok(this.stderr.includes(lockPaths.get(this)!), this.stderr);
});

Then("the error mentions the lock, the process that is gone and that the lock file can be removed", function (this: OidWorld) {
  assert.ok(this.stderr.includes(LOCK), this.stderr);
  assert.ok(this.stderr.includes(lockPaths.get(this)!), this.stderr);
  assert.match(this.stderr, /remove/);
});

Then("the error mentions {string}", function (this: OidWorld, text: string) {
  assert.ok(this.stderr.includes(text), this.stderr);
});

Then("no worktree or branch was created", function (this: OidWorld) {
  assert.equal(worktrees(this).length, 1);
  assert.equal(git(this.projectDir, "branch", "--format=%(refname:short)"), "main");
});

Then("the lock is still held by that process", function (this: OidWorld) {
  assert.equal(readFileSync(this.path(join(PROJECT, LOCK)), "utf8").trim(), lockPaths.get(this));
});

Then("the lock file is as it was", function (this: OidWorld) {
  assert.equal(readFileSync(this.path(join(PROJECT, LOCK)), "utf8"), `${lockPaths.get(this)}\n`);
});

Then("the lock held while the suite ran named the process of the run", function (this: OidWorld) {
  const seen = JSON.parse(readFileSync(this.path("lock-seen.json"), "utf8")) as { lock: string; chain: number[] };
  assert.ok(seen.chain.includes(Number(seen.lock)), JSON.stringify(seen));
  assert.equal(Number(seen.lock), process.pid);
});

Then("the project has no lock", function (this: OidWorld) {
  assert.ok(existsSync(join(runDirectory(this), "events.jsonl")), "the run did not start");
  assert.ok(!existsSync(this.path(join(PROJECT, LOCK))));
});
