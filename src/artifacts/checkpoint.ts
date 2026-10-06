import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { writeFileAtomic } from "./atomic-write.js";
import { ProgressError } from "./progress.js";
import { readJson } from "./project-json.js";

const GIT = "git";
const HEAD = "HEAD";
export const GIT_DIFF = "diff";
const REV_PARSE = "rev-parse";
const NUL_SEPARATED = "-z";
const NUL = "\0";
/** `git diff --name-status -z` prints a status and a path for each file. */
const NAME_STATUS_FIELDS = 2;
/** Spaces of indentation of the JSON files oid writes. */
const JSON_INDENT = 2;
const OID_DIR = ".outside-in";
const CHECKPOINT_FILE = `${OID_DIR}/checkpoint.json`;
/** The content of the files of the snapshot, kept to tell later which lines were added since. */
const CHECKPOINT_FILES = `${OID_DIR}/checkpoint-files`;

export interface CheckpointDetails {
  step: string;
  feature: string | null;
  verify: { kind: string; target: string };
  /** Whether a person or an agent outside oid took the decision that the verification rests on. */
  external: boolean;
  date: Date;
}

/** The SHA-256 of a file of the project, as hex. */
function hashFile(cwd: string, name: string): string {
  return createHash("sha256").update(readFileSync(join(cwd, name))).digest("hex");
}

/** The part of a checkpoint file that comparing with it needs. */
const checkpointSchema = z.object({ snapshot: z.record(z.string(), z.string()), deleted: z.array(z.string()).default([]) });

/** Runs `git` with `args` in the project, giving it `input` to read: whether it succeeded and what it printed. */
export function runGit(cwd: string, args: string[], input?: string): { ok: boolean; text: string } {
  const run = spawnSync(GIT, args, { cwd, input });
  return { ok: run.status === 0, text: run.stdout.toString() };
}

/** The NUL-separated names `git` prints for `args` in the project. */
function gitNames(cwd: string, args: string[]): string[] {
  return spawnSync(GIT, args, { cwd }).stdout.toString().split(NUL).filter((name) => name !== "");
}

/** The files of the working tree that differ from HEAD: those that exist (modified, added, untracked) and those that were deleted. */
function changesFromHead(cwd: string): { present: string[]; deleted: string[] } {
  const tokens = gitNames(cwd, [GIT_DIFF, "--name-status", "--no-renames", NUL_SEPARATED, HEAD]);
  const present: string[] = gitNames(cwd, ["ls-files", "--others", "--exclude-standard", NUL_SEPARATED]);
  const deleted: string[] = [];
  for (let at = 0; at < tokens.length; at += NAME_STATUS_FIELDS) (tokens[at] === "D" ? deleted : present).push(tokens[at + 1]!);
  return { present: present.filter((name) => !name.startsWith(`${OID_DIR}/`) && lstatSync(join(cwd, name)).isFile()), deleted };
}

/** Records the verification that just passed in `.outside-in/checkpoint.json`, with a hash of every file of the working tree that differs from HEAD, and keeps a copy of each of them. */
export function recordCheckpoint(cwd: string, { date, ...details }: CheckpointDetails): void {
  if (spawnSync(GIT, [REV_PARSE, "--verify", "--quiet", HEAD], { cwd }).status !== 0) {
    throw new ProgressError("a checkpoint compares with HEAD: this directory is not a git repository with a commit");
  }
  const { present, deleted } = changesFromHead(cwd);
  const snapshot = Object.fromEntries(present.map((name) => [name, hashFile(cwd, name)]));
  rmSync(join(cwd, CHECKPOINT_FILES), { recursive: true, force: true });
  for (const name of present) {
    mkdirSync(dirname(join(cwd, CHECKPOINT_FILES, name)), { recursive: true });
    copyFileSync(join(cwd, name), join(cwd, CHECKPOINT_FILES, name));
  }
  mkdirSync(join(cwd, OID_DIR), { recursive: true });
  writeFileAtomic(join(cwd, CHECKPOINT_FILE), `${JSON.stringify({ ...details, date: date.toISOString(), snapshot, deleted }, null, JSON_INDENT)}\n`);
}

/** What the last checkpoint recorded: the hash of each file that differed from HEAD then, and the files deleted then. Nothing when there is no checkpoint. */
function lastCheckpoint(cwd: string): z.infer<typeof checkpointSchema> {
  const parsed = checkpointSchema.safeParse(readJson(cwd, CHECKPOINT_FILE) ?? { snapshot: {} });
  if (!parsed.success) throw new ProgressError(`${CHECKPOINT_FILE} is not a checkpoint oid wrote: verify again to record a new one`);
  return parsed.data;
}

/** The files that changed since the last checkpoint, or since HEAD when there is none: those whose content is not the one the checkpoint recorded, and those deleted since. */
export function changedSinceCheckpoint(cwd: string): string[] {
  const { present, deleted } = changesFromHead(cwd);
  const last = lastCheckpoint(cwd);
  return [...present.filter((name) => last.snapshot[name] !== hashFile(cwd, name)), ...deleted.filter((name) => !last.deleted.includes(name))];
}

/** The content of `name` as it was at the last checkpoint, or in HEAD when there is none or the file is not in it; undefined when HEAD has no such file. */
export function baseContent(cwd: string, name: string): string | undefined {
  const kept = join(cwd, CHECKPOINT_FILES, name);
  if (name in lastCheckpoint(cwd).snapshot && existsSync(kept)) return readFileSync(kept).toString();
  const shown = runGit(cwd, ["show", `${HEAD}:${name}`]);
  return shown.ok ? shown.text : undefined;
}
