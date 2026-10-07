#!/usr/bin/env node
// Claude Code hooks for working on oid (docs/BOOTSTRAP.md §2.5): they make the cycle rules mechanical.
//   after-edit   (PostToolUse on Edit|Write|MultiEdit): while a feature is focused, run `oid verify integrity`.
//   before-step  (PreToolUse on Bash): `oid progress step <FR> <step>` leaving bdd_red, tdd_red or tdd_green
//                needs the matching `oid verify` to have passed for that feature (.outside-in/checkpoint.json)
//                on the content there is now: any change since the verification (other than progress.json and
//                .outside-in/) invalidates it. Before `oid verify red|green` replaces the checkpoint, the
//                changes since the last one must pass `oid verify integrity`, or a violation would be absorbed.
// Exit 2 tells Claude Code to show stderr to the agent (and, before a tool call, to block it).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BLOCK = 2;
const VERIFY_FOR_STEP = { bdd_red: "oid verify red <feature file>:<line>", tdd_red: 'oid verify red "<test file> > <test name>"', tdd_green: "oid verify green" };
const STEP_COMMAND = /\boid\s+progress\s+step\s+(\S+)\s+(\S+)/;
const VERIFY_COMMAND = /\boid\s+verify\s+(red|green)\b/;

const project = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined);
const block = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(BLOCK);
};

/** While a feature is focused, blocks with what `oid verify integrity` reports, if anything. */
function requireIntegrity(what) {
  const progress = readJson(join(project, "progress.json"));
  if (!progress?.current_focus) return;
  const run = spawnSync("oid", ["verify", "integrity"], { cwd: project, encoding: "utf8" });
  if (run.status !== 0) block(`oid verify integrity found a problem ${what}:\n${run.stdout}${run.stderr}`);
}

const afterEdit = () => requireIntegrity("with this change");

/** The NUL-separated names `git` prints for `args` in the project. */
const gitNames = (args) => (spawnSync("git", args, { cwd: project }).stdout?.toString() ?? "").split("\0").filter((name) => name !== "");

/** The hash of a file of the project as the checkpoint records it, or undefined when it does not exist. */
function hashOf(name) {
  const path = join(project, name);
  return existsSync(path) && lstatSync(path).isFile() ? createHash("sha256").update(readFileSync(path)).digest("hex") : undefined;
}

/** The files whose content is not the one the checkpoint verified: same comparison as oid's changedSinceCheckpoint (snapshot hashes, recorded deletions, HEAD for the rest), leaving out progress.json and .outside-in/. */
function changedSinceVerified(checkpoint) {
  const tokens = gitNames(["diff", "--name-status", "--no-renames", "-z", "HEAD"]);
  const fromHead = new Set(gitNames(["ls-files", "--others", "--exclude-standard", "-z"]));
  for (let at = 1; at < tokens.length; at += 2) fromHead.add(tokens[at]);
  const snapshot = checkpoint.snapshot ?? {};
  const deleted = checkpoint.deleted ?? [];
  const names = new Set([...fromHead, ...Object.keys(snapshot), ...deleted]);
  return [...names].filter((name) => {
    if (name === "progress.json" || name.startsWith(".outside-in/")) return false;
    if (name in snapshot) return hashOf(name) !== snapshot[name];
    if (deleted.includes(name)) return hashOf(name) !== undefined;
    return true;
  });
}

function beforeStep(input) {
  const command = input.tool_input?.command ?? "";
  if (VERIFY_COMMAND.test(command)) requireIntegrity("since the last verification; fix it before verifying again, or the new checkpoint would absorb it");
  const match = STEP_COMMAND.exec(command);
  if (!match) return;
  const [, id] = match;
  const feature = readJson(join(project, "progress.json"))?.features?.find((candidate) => candidate.id === id);
  const from = feature?.cycle_step;
  if (!(from in VERIFY_FOR_STEP)) return;
  const checkpoint = readJson(join(project, ".outside-in", "checkpoint.json"));
  if (checkpoint?.step === from && checkpoint?.feature === id) {
    const changed = changedSinceVerified(checkpoint);
    if (changed.length === 0) return;
    block(`${id}: what \`${VERIFY_FOR_STEP[from]}\` verified has changed since (${changed.join(", ")}): run it again before leaving ${from}.`);
  }
  block(`${id} is in ${from}: run \`${VERIFY_FOR_STEP[from]}\` and get it to pass for ${id} before leaving ${from}.`);
}

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
if (process.argv[2] === "after-edit") afterEdit();
else if (process.argv[2] === "before-step") beforeStep(input);
