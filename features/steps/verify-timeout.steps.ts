import { After, Before, Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandTimeoutError, REAL_RUNNERS, type Runners } from "../../src/artifacts/verify-runner.js";
import { loadCommandTimeoutS } from "../../src/artifacts/project-config.js";
import { CART_CODE } from "../support/cart-files.js";
import { git } from "../support/run-project.js";
import type { OidWorld } from "../support/world.js";
import { agentOf } from "./run-features.steps.js";
import { codeRound, expect } from "./run-loop.steps.js";
import { change, HANGS } from "./run.steps.js";

/** The parts of the configuration file these steps change. */
type ConfigFile = { commands: { unit: string }; limits?: object };

const CONFIG_FILE = ".outside-in.json";
const RUNNER_FILE = "hang-runner.mjs";
const PIDS_FILE = "pids.txt";
/** How long the runner lives when nothing stops it: far longer than the limit of the scenarios, short enough that a missing implementation does not hang the harness. */
const RUNNER_LIFETIME_S = 8;
/** How long a step waits for a stopped process to disappear from the process table. */
const GONE_WITHIN_MS = 3000;
const POLL_MS = 50;

/** The directory outside the project where each scenario's runner records the ids of the processes it starts. */
const recordings = new WeakMap<OidWorld, string>();

/** The directory of the project: the project inside the scenario directory when there is one, the scenario directory otherwise. */
function projectRoot(world: OidWorld): string {
  return world.projectDir === "" ? world.dir : world.projectDir;
}

/** Whether a process with this id is running: the process table lists it and it is not a zombie waiting to be reaped. */
function isRunning(pid: number): boolean {
  const listed = spawnSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" });
  return listed.status === 0 && !listed.stdout.trim().startsWith("Z");
}

/** The ids of the processes the runner of the scenario recorded: itself and its child. */
function recordedPids(world: OidWorld): number[] {
  const file = join(recordings.get(world)!, PIDS_FILE);
  return existsSync(file) ? readFileSync(file, "utf8").trim().split(/\s+/).filter(Boolean).map(Number) : [];
}

const RUNNER_TAGS = "@FR-VERIFY-07 or @FR-VERIFY-10";

Before({ tags: RUNNER_TAGS }, function (this: OidWorld) {
  recordings.set(this, mkdtempSync(join(tmpdir(), "oid-hang-")));
});

After({ tags: RUNNER_TAGS }, function (this: OidWorld) {
  for (const pid of recordedPids(this)) if (isRunning(pid)) process.kill(pid, "SIGKILL");
  rmSync(recordings.get(this)!, { recursive: true, force: true });
});

/** Changes the configuration of the project, and commits the change when the project is already a repository. */
function configure(world: OidWorld, update: (config: ConfigFile) => void, extraFile?: { name: string; content: string }): void {
  const root = projectRoot(world);
  const config = JSON.parse(readFileSync(join(root, CONFIG_FILE), "utf8")) as ConfigFile;
  update(config);
  writeFileSync(join(root, CONFIG_FILE), `${JSON.stringify(config, null, 2)}\n`);
  if (extraFile !== undefined) writeFileSync(join(root, extraFile.name), extraFile.content);
  if (world.projectDir !== "") {
    git(root, "add", "-A");
    git(root, "commit", "--quiet", "--message", "configuration");
  }
}

Given("the unit command of the project is a runner that never ends and starts a child process", function (this: OidWorld) {
  const pids = join(recordings.get(this)!, PIDS_FILE);
  const script = [
    `import { spawn } from "node:child_process";`,
    `import { appendFileSync } from "node:fs";`,
    `const child = spawn("sleep", ["${RUNNER_LIFETIME_S}"], { stdio: "ignore" });`,
    `appendFileSync(${JSON.stringify(pids)}, process.pid + "\\n" + child.pid + "\\n");`,
    `setTimeout(() => process.exit(0), ${RUNNER_LIFETIME_S * 1000});`,
    "",
  ].join("\n");
  configure(
    this,
    (config) => {
      config.commands.unit = `node ${RUNNER_FILE}`;
    },
    { name: RUNNER_FILE, content: script },
  );
});

Given("the limit {string} of the project is {int}", function (this: OidWorld, key: string, seconds: number) {
  assert.equal(key, "limits.command_timeout_s");
  configure(this, (config) => {
    config.limits = { ...config.limits, command_timeout_s: seconds };
  });
});

Given("the unit runner does not end within the limit while it checks the coding agent's first attempt", function (this: OidWorld) {
  agentOf(this).codeRoute.rounds.push(codeRound(CART_CODE.withCount));
  expect(this, { unit: [HANGS] });
});

Given("the BDD runner does not end within the limit in the quality gate", function (this: OidWorld) {
  change(this, (fixture) => (fixture.cucumber!.suite = [HANGS]));
});

/** The invocation of the fixture's linter that fixes: the project's linter command with the flag oid appends in fix mode. */
const LINT_FIX_SUFFIX = " --fix";

Given("the linter's fix does not end within the limit in the quality gate", function (this: OidWorld) {
  const services = this.services!;
  const runners = services.runners ?? REAL_RUNNERS;
  const seconds = loadCommandTimeoutS(projectRoot(this));
  // The system's own error, as the supervisor of a real command throws it, without waiting for a process to pass its limit.
  const command: Runners["command"] = (cwd, commandLine) => {
    if (commandLine.endsWith(LINT_FIX_SUFFIX)) throw new CommandTimeoutError(commandLine, seconds);
    return runners.command(cwd, commandLine);
  };
  this.services = { ...services, runners: { ...runners, command } };
});

Given("the unit runner does not end within the limit while it checks the refactor", function (this: OidWorld) {
  agentOf(this).refactorRoute.rounds.push(codeRound(CART_CODE.refactored));
  expect(this, { unit: [HANGS], bdd: ["bdd-add-line-green"] });
});

Then("no process started by the runner is still alive", async function (this: OidWorld) {
  const pids = recordedPids(this);
  assert.ok(pids.length >= 2, `the runner recorded ${pids.length} processes (expected itself and its child); stdout: ${this.stdout}; stderr: ${this.stderr}`);
  const deadline = Date.now() + GONE_WITHIN_MS;
  while (pids.some(isRunning) && Date.now() < deadline) await new Promise((done) => setTimeout(done, POLL_MS));
  assert.deepEqual(pids.filter(isRunning), [], "processes the runner started are still alive");
});

Then("the project has no verify lock", function (this: OidWorld) {
  const outside = join(projectRoot(this), ".outside-in");
  assert.ok(!existsSync(join(outside, "verify.lock")), `verify.lock is still there; ${existsSync(outside) ? readdirSync(outside).join(", ") : ""}`);
});
