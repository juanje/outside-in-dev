import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { git, runWorktree } from "../support/run-project.js";
import { runWithTerminal } from "./run-features.steps.js";
import { holdRunningLock, runDirectory, type SavedSession, session, SESSION, transitions } from "./run.steps.js";
import type { OidWorld } from "../support/world.js";

type CleanFixture = { runs: Set<string> };

const fixtures = new WeakMap<OidWorld, CleanFixture>();

function fixtureOf(world: OidWorld): CleanFixture {
  const fixture = fixtures.get(world);
  assert.ok(fixture, "no clean fixture was created");
  return fixture;
}

const savedRuns = new WeakMap<OidWorld, SavedSession>();

/** Keeps the run the saved session names, read when the run saved it: `oid clean` may remove the session. */
export function rememberSavedRun(world: OidWorld): void {
  savedRuns.set(world, session(world));
}

function savedRunOf(world: OidWorld): SavedSession {
  const saved = savedRuns.get(world);
  assert.ok(saved, "no saved run was remembered");
  return saved;
}

function worktreeOf(world: OidWorld, runId: string): string {
  return resolve(world.projectDir, "..", ".oid-worktrees", basename(world.projectDir), runId);
}

function runDataOf(world: OidWorld, runId: string): string {
  return join(world.projectDir, ".outside-in", "runs", runId);
}

function branchOf(runId: string): string {
  return `oid/${runId}`;
}

function recordState(world: OidWorld, runId: string, state: string): void {
  writeFileSync(join(runDataOf(world, runId), "events.jsonl"), `${JSON.stringify({ ts: 1, type: "state_change", to: state })}\n`);
}

Given(
  "a run {string} that can be resumed, with its worktree, run data and branch",
  function (this: OidWorld, runId: string) {
    const root = join(this.projectDir, ".outside-in", "runs");
    mkdirSync(root, { recursive: true });
    git(this.projectDir, "worktree", "add", "--quiet", "-b", branchOf(runId), worktreeOf(this, runId), "HEAD");
    mkdirSync(runDataOf(this, runId), { recursive: true });
    writeFileSync(join(runDataOf(this, runId), "baseline.json"), "{}\n");
    recordState(this, runId, "BDD_RED");
    writeFileSync(
      join(this.projectDir, ".outside-in", "session.json"),
      JSON.stringify({
        runId,
        worktree: worktreeOf(this, runId),
        branch: branchOf(runId),
        baseCommit: git(this.projectDir, "rev-parse", "HEAD"),
        state: "BDD_RED",
        pendingInput: null,
      }),
    );
    fixtures.set(this, { runs: new Set([runId]) });
  },
);

Given(
  "a run {string} is in progress, with its worktree, run data and branch",
  function (this: OidWorld, runId: string) {
    const root = join(this.projectDir, ".outside-in", "runs");
    mkdirSync(root, { recursive: true });
    git(this.projectDir, "worktree", "add", "--quiet", "-b", branchOf(runId), worktreeOf(this, runId), "HEAD");
    mkdirSync(runDataOf(this, runId), { recursive: true });
    writeFileSync(join(runDataOf(this, runId), "baseline.json"), "{}\n");
    recordState(this, runId, "BDD_RED");
    writeFileSync(
      join(this.projectDir, SESSION),
      JSON.stringify({
        runId,
        worktree: worktreeOf(this, runId),
        branch: branchOf(runId),
        baseCommit: git(this.projectDir, "rev-parse", "HEAD"),
        state: "BDD_RED",
        pendingInput: null,
      }),
    );
    fixtures.set(this, { runs: new Set([runId]) });
    holdRunningLock(this);
  },
);

Given(
  "a run {string} has a process holding the lock, with its worktree, run data and branch",
  function (this: OidWorld, runId: string) {
    const root = join(this.projectDir, ".outside-in", "runs");
    mkdirSync(root, { recursive: true });
    git(this.projectDir, "worktree", "add", "--quiet", "-b", branchOf(runId), worktreeOf(this, runId), "HEAD");
    mkdirSync(runDataOf(this, runId), { recursive: true });
    writeFileSync(join(runDataOf(this, runId), "baseline.json"), "{}\n");
    recordState(this, runId, "BDD_RED");
    writeFileSync(
      join(this.projectDir, SESSION),
      JSON.stringify({
        runId,
        worktree: worktreeOf(this, runId),
        branch: branchOf(runId),
        baseCommit: git(this.projectDir, "rev-parse", "HEAD"),
        state: "BDD_RED",
        pendingInput: null,
      }),
    );
    fixtures.set(this, { runs: new Set([runId]) });
    holdRunningLock(this);
    assert.equal(existsSync(worktreeOf(this, runId)), true, `${runId} worktree was not created`);
    assert.equal(existsSync(runDataOf(this, runId)), true, `${runId} run data was not created`);
    assert.equal(existsSync(join(this.projectDir, ".outside-in", "lock")), true, "project lock was not created");
  },
);

Given("the saved session names {string}", function (this: OidWorld, runId: string) {
  const sessionPath = join(this.projectDir, ".outside-in", "session.json");
  assert.equal(JSON.parse(readFileSync(sessionPath, "utf8")).runId, runId, "saved session has the wrong run");
});

Given(
  "finished runs {string}, {string} and {string} with their worktrees, run data and branches",
  function (this: OidWorld, first: string, second: string, third: string) {
    createFinishedRuns(this, [first, second, third]);
  },
);

Given(
  "finished runs {string} and {string} with their worktrees, run data and branches",
  function (this: OidWorld, first: string, second: string) {
    createFinishedRuns(this, [first, second]);
  },
);

function createFinishedRuns(world: OidWorld, runs: string[]): void {
  const root = join(world.projectDir, ".outside-in", "runs");
  mkdirSync(root, { recursive: true });
  for (const runId of runs) {
    const worktree = worktreeOf(world, runId);
    git(world.projectDir, "worktree", "add", "--quiet", "-b", branchOf(runId), worktree, "HEAD");
    mkdirSync(runDataOf(world, runId), { recursive: true });
    writeFileSync(join(runDataOf(world, runId), "baseline.json"), "{}\n");
    recordState(world, runId, "DONE");
  }
  fixtures.set(world, { runs: new Set(runs) });
}

Given("finished run {string} has a worktree that cannot be removed, its run data and branch", function (this: OidWorld, runId: string) {
  createFinishedRuns(this, [runId]);
  git(this.projectDir, "worktree", "lock", "--reason", "the removal is expected to fail", worktreeOf(this, runId));
  const run = this.run.bind(this);
  this.run = async (commandLine: string) => {
    try {
      await run(commandLine);
    } catch (error) {
      this.stderr = error instanceof Error ? error.message : String(error);
    }
  };
});

Given("{string} reached its commit and cannot be resumed", function (this: OidWorld, runId: string) {
  assert.ok(fixtureOf(this).runs.has(runId));
  recordState(this, runId, "FR_COMMIT");
});

Given("{string} stopped before its features were selected and cannot be resumed", function (this: OidWorld, runId: string) {
  assert.ok(fixtureOf(this).runs.has(runId));
  recordState(this, runId, "SELECT_FR");
});

Given("{string} was replaced by a later run as the saved session and cannot be resumed", function (this: OidWorld, runId: string) {
  assert.ok(fixtureOf(this).runs.has(runId));
  this.write("project/.outside-in/session.json", JSON.stringify({ runId: "later-run", state: "DONE", pendingInput: null }));
  recordState(this, runId, "DONE");
});

function assertKept(world: OidWorld, runId: string, worktree: string): void {
  assert.equal(existsSync(worktree), true, `${runId} worktree was removed`);
  assert.ok(git(world.projectDir, "worktree", "list", "--porcelain").includes(worktree), `${runId} remains unregistered`);
  assert.equal(existsSync(runDataOf(world, runId)), true, `${runId} run data was removed`);
}

function assertWorktreeNotRemoved(world: OidWorld, runId: string): void {
  assert.match(world.stderr, /worktree/i);
  assert.match(world.stderr, /could not be removed/i);
  assert.ok(world.stderr.includes(runId), `error did not name ${runId}: ${world.stderr}`);
}

/** The run that a real `oid run` of the scenario left: its id is the one of its run directory. */
const realRunId = (world: OidWorld): string => basename(runDirectory(world));

Then("the worktree and run data of {string} are kept", function (this: OidWorld, runId: string) {
  assertKept(this, runId, worktreeOf(this, runId));
});

Then("the worktree and run data of the saved run are kept", function (this: OidWorld) {
  const saved = savedRunOf(this);
  assertKept(this, saved.runId, saved.worktree);
});

Then("the output says to run {string} with the saved run to clean it", function (this: OidWorld, command: string) {
  const expected = `${command} ${savedRunOf(this).runId}`;
  assert.ok(this.stdout.includes(expected), `output did not say to run ${expected}: ${this.stdout}`);
});

When("I run {string} with the saved run", async function (this: OidWorld, command: string) {
  await this.run(`${command} ${savedRunOf(this).runId}`);
});

Given("{string} ran to its commit with a terminal where the human answers {string}", async function (this: OidWorld, commandLine: string, answer: string) {
  await runWithTerminal(this, commandLine, [answer], []);
  assert.ok(
    transitions(this).some((event) => event.to === "FR_COMMIT"),
    `the run did not reach its commit: ${this.stdout}${this.stderr}`,
  );
});

Given("the worktree of that run cannot be removed", function (this: OidWorld) {
  git(this.projectDir, "worktree", "lock", "--reason", "the removal is expected to fail", runWorktree(this).path);
});

Then("the error mentions that the worktree of {string} could not be removed", function (this: OidWorld, runId: string) {
  assertWorktreeNotRemoved(this, runId);
});

Then("the error mentions that the worktree of that run could not be removed", function (this: OidWorld) {
  assertWorktreeNotRemoved(this, realRunId(this));
});

Then("the run data of that run is kept", function (this: OidWorld) {
  assert.equal(existsSync(runDataOf(this, realRunId(this))), true, "the run data was removed");
});

Then("the run data of {string} under {string} is kept", function (this: OidWorld, runId: string, directory: string) {
  assert.equal(directory, ".outside-in/runs/");
  assert.equal(existsSync(runDataOf(this, runId)), true, `${runId} run data was removed`);
});

Then("the worktree and run data of {string} are removed", function (this: OidWorld, runId: string) {
  assert.equal(existsSync(worktreeOf(this, runId)), false, `${runId} worktree still exists`);
  assert.ok(!git(this.projectDir, "worktree", "list", "--porcelain").includes(worktreeOf(this, runId)), `${runId} remains registered`);
  assert.equal(existsSync(runDataOf(this, runId)), false, `${runId} run data still exists`);
});

Then("the saved session is removed", function (this: OidWorld) {
  assert.equal(existsSync(join(this.projectDir, ".outside-in", "session.json")), false, "saved session still exists");
});

Then("the output says to run {string} to clean it", function (this: OidWorld, command: string) {
  assert.ok(this.stdout.includes(command), `output did not say to run ${command}: ${this.stdout}`);
});

Then("the branch of {string} is kept", function (this: OidWorld, runId: string) {
  assert.equal(
    git(this.projectDir, "rev-parse", "--verify", `refs/heads/${branchOf(runId)}`),
    git(this.projectDir, "rev-parse", branchOf(runId)),
    `${runId} branch was removed`,
  );
});

Then("the worktrees of {string}, {string} and {string} are removed", function (this: OidWorld, first: string, second: string, third: string) {
  for (const runId of [first, second, third]) {
    assert.equal(existsSync(worktreeOf(this, runId)), false, `${runId} worktree still exists`);
    assert.ok(!git(this.projectDir, "worktree", "list", "--porcelain").includes(worktreeOf(this, runId)), `${runId} remains registered`);
  }
});

Then("the run data of {string}, {string} and {string} under {string} is removed", function (this: OidWorld, first: string, second: string, third: string, directory: string) {
  assert.equal(directory, ".outside-in/runs/");
  for (const runId of [first, second, third]) assert.equal(existsSync(runDataOf(this, runId)), false, `${runId} run data still exists`);
});

Then("the branches of {string}, {string} and {string} are kept", function (this: OidWorld, first: string, second: string, third: string) {
  for (const runId of [first, second, third]) {
    assert.equal(readFileSync(join(this.projectDir, ".git", "HEAD"), "utf8").startsWith("ref:"), true);
    assert.equal(
      git(this.projectDir, "rev-parse", "--verify", `refs/heads/${branchOf(runId)}`),
      git(this.projectDir, "rev-parse", branchOf(runId)),
      `${runId} branch was removed`,
    );
  }
});

Then("the branches of {string} and {string} are kept", function (this: OidWorld, first: string, second: string) {
  for (const runId of [first, second]) {
    assert.equal(readFileSync(join(this.projectDir, ".git", "HEAD"), "utf8").startsWith("ref:"), true);
    assert.equal(
      git(this.projectDir, "rev-parse", "--verify", `refs/heads/${branchOf(runId)}`),
      git(this.projectDir, "rev-parse", branchOf(runId)),
      `${runId} branch was removed`,
    );
  }
});

Then("no worktree or run data was removed", function (this: OidWorld) {
  const worktrees = git(this.projectDir, "worktree", "list", "--porcelain")
    .split("\n\n")
    .filter((entry) => entry.trim() !== "");
  assert.equal(worktrees.length, 1, "a worktree was removed");
  assert.equal(existsSync(join(this.projectDir, ".outside-in", "runs")), false, "run data was removed");
});
