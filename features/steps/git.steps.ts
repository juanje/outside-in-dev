import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type { OidWorld } from "../support/world.js";

type Workspace = { path: string; branch: string; startCommit: string };
type Install = { command: string[]; cwd: string };
type GitScenario = {
  repo: string;
  head: string;
  branch: string;
  status: string;
  installs: Install[];
  workspace?: Workspace;
  refusal?: string;
  checkpoint?: string;
  squash?: string;
};

const REPO_NAME = "project";
const DEFAULT_RUN_ID = "run-1";
const INITIAL_BRANCH = "main";
const FIXTURE_PATHS = { source: ["src/**"], shared: [], unit_tests: [], bdd_features: [], bdd_steps: [], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" };
const FIXTURE_COMMANDS = { bdd: "b", unit: "u", typecheck: "t", format: null, lint: null, coverage: null, extra_checks: [] };

const scenarios = new WeakMap<OidWorld, GitScenario>();

function scenarioOf(world: OidWorld): GitScenario {
  const found = scenarios.get(world);
  assert.ok(found, "no project repository was created");
  return found;
}

/** Runs git in `cwd` and returns its trimmed standard output; a failing git fails the step. */
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

function commitEverything(repo: string, message: string): void {
  git(repo, "add", "-A");
  git(repo, "commit", "--quiet", "--message", message);
}

function writeIn(repo: string, name: string, content: string): void {
  mkdirSync(dirname(join(repo, name)), { recursive: true });
  writeFileSync(join(repo, name), content);
}

/** Records the state of the user's copy that a run must leave alone. */
function observe(repo: string): Pick<GitScenario, "head" | "branch" | "status"> {
  return { head: git(repo, "rev-parse", "HEAD"), branch: git(repo, "branch", "--show-current"), status: git(repo, "status", "--porcelain", "--ignored") };
}

Given(
  "a project repository with a committed file {string} and a lockfile {string} containing {string}",
  function (this: OidWorld, file: string, lockfile: string, lock: string) {
    const repo = join(this.dir, REPO_NAME);
    mkdirSync(repo, { recursive: true });
    git(repo, "init", "--quiet", "--initial-branch", INITIAL_BRANCH);
    git(repo, "config", "user.name", "Fixture");
    git(repo, "config", "user.email", "fixture@example.com");
    writeIn(repo, file, "# Project\n");
    writeIn(repo, lockfile, `${lock}\n`);
    writeIn(repo, ".gitignore", "node_modules\n");
    commitEverything(repo, "fixture");
    scenarios.set(this, { repo, installs: [], ...observe(repo) });
  },
);

function writeConfig(world: OidWorld, settings: Record<string, string>): void {
  const state = scenarioOf(world);
  const config = { version: 1, stack: "typescript", paths: FIXTURE_PATHS, commands: FIXTURE_COMMANDS, settings };
  writeIn(state.repo, ".outside-in.json", JSON.stringify(config));
  commitEverything(state.repo, "configure oid");
  Object.assign(state, observe(state.repo));
}

Given("a branch {string} already exists", function (this: OidWorld, branch: string) {
  git(scenarioOf(this).repo, "branch", branch);
});

Given("the worktree directory of the run {string} already exists", function (this: OidWorld, runId: string) {
  mkdirSync(join(this.dir, ".oid-worktrees", REPO_NAME, runId), { recursive: true });
});

Given("the project configuration sets the branch prefix {string} and the worktree directory {string}", function (this: OidWorld, prefix: string, directory: string) {
  writeConfig(this, { branch_prefix: prefix, worktree_dir: directory });
});

Given("the project is configured to work in place", function (this: OidWorld) {
  writeConfig(this, { isolation: "in_place" });
});

Given("the user's copy has an untracked file {string}", function (this: OidWorld, name: string) {
  const state = scenarioOf(this);
  writeIn(state.repo, name, "notes\n");
  Object.assign(state, observe(state.repo));
});

Given("the user's copy has installed dependencies", function (this: OidWorld) {
  writeIn(scenarioOf(this).repo, "node_modules/dep/index.js", "module.exports = 1;\n");
});

Given("the lockfile of the user's copy has uncommitted differences from the committed one", function (this: OidWorld) {
  const state = scenarioOf(this);
  writeIn(state.repo, "package-lock.json", "lock B\n");
  Object.assign(state, observe(state.repo));
});

type StartOptions = { runId: string; name?: string; now?: Date };

async function start(world: OidWorld, options: StartOptions): Promise<void> {
  const state = scenarioOf(world);
  const { startRun } = await import("../../src/artifacts/git-workspace.js");
  try {
    state.workspace = startRun(state.repo, {
      ...options,
      install: (command: string[], cwd: string) => {
        state.installs.push({ command, cwd });
      },
    });
  } catch (error) {
    state.refusal = error instanceof Error ? error.message : String(error);
  }
}

When("a run starts and is named {string}", async function (this: OidWorld, name: string) {
  await start(this, { runId: DEFAULT_RUN_ID, name });
});

Given("a run started and named {string}", async function (this: OidWorld, name: string) {
  await start(this, { runId: DEFAULT_RUN_ID, name });
  assert.ok(scenarioOf(this).workspace, `the run did not start: ${scenarioOf(this).refusal}`);
});

When("a run with the identifier {string} starts and is named {string}", async function (this: OidWorld, runId: string, name: string) {
  await start(this, { runId, name });
});

When("a run starts without a name at {int}-{int}-{int} {int}:{int}:{int}", async function (this: OidWorld, y: number, mo: number, d: number, h: number, mi: number, s: number) {
  await start(this, { runId: DEFAULT_RUN_ID, now: new Date(y, mo - 1, d, h, mi, s) });
});

When("the run's worktree is removed", async function (this: OidWorld) {
  const state = scenarioOf(this);
  const { removeWorktree } = await import("../../src/artifacts/git-workspace.js");
  assert.ok(state.workspace, "no run was started");
  removeWorktree(state.repo, state.workspace);
});

function workspaceOf(world: OidWorld): Workspace {
  const state = scenarioOf(world);
  assert.ok(state.workspace, `the run did not start: ${state.refusal}`);
  return state.workspace;
}

Then("the work happens in a worktree outside the user's copy, on the branch {string}", function (this: OidWorld, branch: string) {
  const { repo } = scenarioOf(this);
  const workspace = workspaceOf(this);
  assert.equal(workspace.branch, branch);
  assert.equal(git(workspace.path, "branch", "--show-current"), branch);
  assert.equal(realpathSync(workspace.path), realpathSync(resolve(repo, "..", ".oid-worktrees", basename(repo), DEFAULT_RUN_ID)));
  assert.notEqual(realpathSync(git(workspace.path, "rev-parse", "--show-toplevel")), realpathSync(repo));
});

Then("the work happens on the branch {string}", function (this: OidWorld, branch: string) {
  assert.equal(git(workspaceOf(this).path, "branch", "--show-current"), branch);
});

Then("the work happens in a worktree under {string}, on the branch {string}", function (this: OidWorld, directory: string, branch: string) {
  const workspace = workspaceOf(this);
  assert.equal(workspace.branch, branch);
  assert.equal(realpathSync(workspace.path), realpathSync(join(this.dir, directory, REPO_NAME, DEFAULT_RUN_ID)));
});

Then("the worktree holds the committed files", function (this: OidWorld) {
  assert.equal(readFileSync(join(workspaceOf(this).path, "README.md"), "utf8"), "# Project\n");
});

Then("the run reports the commit the user's copy was at", function (this: OidWorld) {
  assert.equal(workspaceOf(this).startCommit, scenarioOf(this).head);
});

Then("the user's copy is unchanged, on its own branch", function (this: OidWorld) {
  const state = scenarioOf(this);
  assert.deepEqual(observe(state.repo), { head: state.head, branch: state.branch, status: state.status });
  assert.equal(state.branch, INITIAL_BRANCH);
});

Then("the run is refused with a message containing {string}", function (this: OidWorld, text: string) {
  const state = scenarioOf(this);
  assert.ok(state.refusal, "the run was not refused");
  assert.ok(state.refusal.includes(text), `"${text}" is not in: ${state.refusal}`);
});

Then("no worktree was created", function (this: OidWorld) {
  const { repo } = scenarioOf(this);
  assert.equal(existsSync(join(this.dir, ".oid-worktrees")), false);
  assert.equal(git(repo, "worktree", "list", "--porcelain").split("\n").filter((l) => l.startsWith("worktree ")).length, 1);
});

Then("the branch {string} does not exist", function (this: OidWorld, branch: string) {
  assert.equal(git(scenarioOf(this).repo, "branch", "--list", branch), "");
});

Then("the user's copy is on the branch {string}", function (this: OidWorld, branch: string) {
  assert.equal(git(scenarioOf(this).repo, "branch", "--show-current"), branch);
});

Then("the worktree's dependencies are the user's copy's dependencies", function (this: OidWorld) {
  const { repo } = scenarioOf(this);
  const link = join(workspaceOf(this).path, "node_modules");
  assert.ok(lstatSync(link).isSymbolicLink(), "node_modules in the worktree is not a symbolic link");
  assert.equal(realpathSync(link), realpathSync(join(repo, "node_modules")));
  assert.deepEqual(scenarioOf(this).installs, []);
});

Then("the worktree's dependencies are installed by {string} in the worktree", function (this: OidWorld, command: string) {
  const state = scenarioOf(this);
  const workspace = workspaceOf(this);
  assert.deepEqual(state.installs, [{ command: command.split(" "), cwd: workspace.path }]);
  assert.equal(existsSync(join(workspace.path, "node_modules")), false, "the worktree must not link the user's node_modules");
});

Then("the worktree directory no longer exists", function (this: OidWorld) {
  assert.equal(existsSync(workspaceOf(this).path), false);
  assert.equal(git(scenarioOf(this).repo, "worktree", "list", "--porcelain").includes(".oid-worktrees"), false);
});

/** Calls a git controller function and records its refusal instead of failing the step. */
async function attempt(world: OidWorld, action: (state: GitScenario) => Promise<void> | void): Promise<void> {
  const state = scenarioOf(world);
  try {
    await action(state);
  } catch (error) {
    state.refusal = error instanceof Error ? error.message : String(error);
  }
}

async function makeCheckpoint(world: OidWorld, fr: string, step: string, scenario?: string): Promise<void> {
  const { checkpoint } = await import("../../src/artifacts/git-checkpoints.js");
  await attempt(world, (state) => {
    state.checkpoint = checkpoint(workspaceOf(world), { fr, state: step, scenario });
  });
}

Given("the run's worktree has a new file {string}", function (this: OidWorld, name: string) {
  writeIn(workspaceOf(this).path, name, "content\n");
});

Given("the file {string} of the run's worktree is changed", function (this: OidWorld, name: string) {
  writeIn(workspaceOf(this).path, name, "changed\n");
});

Given("the work is in the user's own copy", function (this: OidWorld) {
  const state = scenarioOf(this);
  state.workspace = { path: state.repo, branch: state.branch, startCommit: state.head };
});

Given("a checkpoint was made for {string} at the state {string}", async function (this: OidWorld, fr: string, step: string) {
  await makeCheckpoint(this, fr, step);
  assert.ok(scenarioOf(this).checkpoint, `no checkpoint: ${scenarioOf(this).refusal}`);
});

When("a checkpoint is made for {string} at the state {string}", async function (this: OidWorld, fr: string, step: string) {
  await makeCheckpoint(this, fr, step);
});

When("a checkpoint is made for {string} at the state {string} for the scenario {string}", async function (this: OidWorld, fr: string, step: string, scenario: string) {
  await makeCheckpoint(this, fr, step, scenario);
});

async function rollBack(world: OidWorld, commit: string | undefined, globs: string): Promise<void> {
  const { rollback } = await import("../../src/artifacts/git-checkpoints.js");
  await attempt(world, () => {
    assert.ok(commit, "no commit to roll back to");
    rollback(workspaceOf(world), commit, globs.split(", "));
  });
}

When("the run is rolled back to the checkpoint, cleaning {string}", async function (this: OidWorld, globs: string) {
  await rollBack(this, scenarioOf(this).checkpoint, globs);
});

When("the run is rolled back to the start of the run, cleaning {string}", async function (this: OidWorld, globs: string) {
  await rollBack(this, workspaceOf(this).startCommit, globs);
});

Then("the run's branch has one new commit named {string} holding {string}", function (this: OidWorld, subject: string, file: string) {
  const { path, startCommit } = workspaceOf(this);
  assert.equal(git(path, "rev-list", "--count", `${startCommit}..HEAD`), "1");
  assert.equal(git(path, "log", "-1", "--format=%s"), subject);
  assert.deepEqual(git(path, "show", "--name-only", "--format=", "HEAD").split("\n"), [file]);
  assert.equal(scenarioOf(this).checkpoint, git(path, "rev-parse", "HEAD"));
});

Then("the run's branch has no new commit", function (this: OidWorld) {
  const { path, startCommit } = workspaceOf(this);
  assert.equal(git(path, "rev-list", "--count", `${startCommit}..HEAD`), "0");
});

Then("the checkpoint is the start commit", function (this: OidWorld) {
  assert.equal(scenarioOf(this).checkpoint, workspaceOf(this).startCommit);
});

Then("the file {string} of the run's worktree has its checkpointed content", function (this: OidWorld, name: string) {
  assert.equal(readFileSync(join(workspaceOf(this).path, name), "utf8"), "content\n");
});

Then("the file {string} of the run's worktree does not exist", function (this: OidWorld, name: string) {
  assert.equal(existsSync(join(workspaceOf(this).path, name)), false);
});

Then("the file {string} of the run's worktree still exists", function (this: OidWorld, name: string) {
  assert.equal(existsSync(join(workspaceOf(this).path, name)), true);
});

Then("the run's branch is at the checkpoint", function (this: OidWorld) {
  assert.equal(git(workspaceOf(this).path, "rev-parse", "HEAD"), scenarioOf(this).checkpoint);
});

Given("the project configuration sets the commit template {string}", function (this: OidWorld, template: string) {
  writeConfig(this, { commit_template: template });
});

When("the feature {string} titled {string} is squashed with the scenarios {string}", async function (this: OidWorld, id: string, title: string, names: string) {
  const { squashFeature } = await import("../../src/artifacts/git-squash.js");
  await attempt(this, (state) => {
    state.squash = squashFeature(workspaceOf(this), { startCommit: workspaceOf(this).startCommit, id, title, scenarios: names.split(", ") });
  });
});

Then("the run's branch has one commit since the start, named {string} and holding {string}", function (this: OidWorld, subject: string, file: string) {
  const { path, startCommit } = workspaceOf(this);
  assert.equal(git(path, "rev-list", "--count", `${startCommit}..HEAD`), "1");
  assert.equal(git(path, "log", "-1", "--format=%s"), subject);
  assert.deepEqual(git(path, "diff", "--name-only", startCommit, "HEAD").split("\n"), [file]);
  assert.equal(scenarioOf(this).squash, git(path, "rev-parse", "HEAD"));
});

Then("the commit lists the scenarios {string}, one per line", function (this: OidWorld, names: string) {
  const body = git(workspaceOf(this).path, "log", "-1", "--format=%b").split("\n");
  assert.deepEqual(body, names.split(", ").map((name) => `- ${name}`));
});

Then("the file {string} of the run's worktree has its changed content", function (this: OidWorld, name: string) {
  assert.equal(readFileSync(join(workspaceOf(this).path, name), "utf8"), "changed\n");
});

Given("a checkpoint was made for {string} at the state {string} for the scenario {string}", async function (this: OidWorld, fr: string, step: string, scenario: string) {
  await makeCheckpoint(this, fr, step, scenario);
  assert.ok(scenarioOf(this).checkpoint, `no checkpoint: ${scenarioOf(this).refusal}`);
});
