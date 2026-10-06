#!/usr/bin/env node
// Claude Code hooks for working on oid (docs/BOOTSTRAP.md §2.5): they make the cycle rules mechanical.
//   after-edit   (PostToolUse on Edit|Write|MultiEdit): while a feature is focused, run `oid verify integrity`.
//   before-step  (PreToolUse on Bash): `oid progress step <FR> <step>` leaving bdd_red, tdd_red or tdd_green
//                needs the matching `oid verify` to have passed for that feature (.outside-in/checkpoint.json).
// Exit 2 tells Claude Code to show stderr to the agent (and, before a tool call, to block it).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BLOCK = 2;
const VERIFY_FOR_STEP = { bdd_red: "oid verify red <feature file>:<line>", tdd_red: 'oid verify red "<test file> > <test name>"', tdd_green: "oid verify green" };
const STEP_COMMAND = /\boid\s+progress\s+step\s+(\S+)\s+(\S+)/;

const project = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined);
const block = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(BLOCK);
};

function afterEdit() {
  const progress = readJson(join(project, "progress.json"));
  if (!progress?.current_focus) return;
  const run = spawnSync("oid", ["verify", "integrity"], { cwd: project, encoding: "utf8" });
  if (run.status !== 0) block(`oid verify integrity found a problem with this change:\n${run.stdout}${run.stderr}`);
}

function beforeStep(input) {
  const match = STEP_COMMAND.exec(input.tool_input?.command ?? "");
  if (!match) return;
  const [, id] = match;
  const feature = readJson(join(project, "progress.json"))?.features?.find((candidate) => candidate.id === id);
  const from = feature?.cycle_step;
  if (!(from in VERIFY_FOR_STEP)) return;
  const checkpoint = readJson(join(project, ".outside-in", "checkpoint.json"));
  if (checkpoint?.step === from && checkpoint?.feature === id) return;
  block(`${id} is in ${from}: run \`${VERIFY_FOR_STEP[from]}\` and get it to pass for ${id} before leaving ${from}.`);
}

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
if (process.argv[2] === "after-edit") afterEdit();
else if (process.argv[2] === "before-step") beforeStep(input);
