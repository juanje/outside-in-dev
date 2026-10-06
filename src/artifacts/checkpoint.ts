import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "./atomic-write.js";
import { ProgressError } from "./progress.js";

const GIT = "git";
const HEAD = "HEAD";
const REV_PARSE = "rev-parse";
const NUL_SEPARATED = "-z";
const NUL = "\0";
/** `git diff --name-status -z` prints a status and a path for each file. */
const NAME_STATUS_FIELDS = 2;
/** Spaces of indentation of the JSON files oid writes. */
const JSON_INDENT = 2;
const OID_DIR = ".outside-in";
const CHECKPOINT_FILE = `${OID_DIR}/checkpoint.json`;

export interface CheckpointDetails {
  step: string;
  feature: string | null;
  verify: { kind: string; target: string };
  /** Whether a person or an agent outside oid took the decision that the verification rests on. */
  external: boolean;
  date: Date;
}

/** The NUL-separated names `git` prints for `args` in the project. */
function gitNames(cwd: string, args: string[]): string[] {
  return spawnSync(GIT, args, { cwd }).stdout.toString().split(NUL).filter((name) => name !== "");
}

/** The files of the working tree that differ from HEAD: those that exist (modified, added, untracked) and those that were deleted. */
function changesFromHead(cwd: string): { present: string[]; deleted: string[] } {
  const tokens = gitNames(cwd, ["diff", "--name-status", "--no-renames", NUL_SEPARATED, HEAD]);
  const present: string[] = gitNames(cwd, ["ls-files", "--others", "--exclude-standard", NUL_SEPARATED]);
  const deleted: string[] = [];
  for (let at = 0; at < tokens.length; at += NAME_STATUS_FIELDS) (tokens[at] === "D" ? deleted : present).push(tokens[at + 1]!);
  return { present: present.filter((name) => !name.startsWith(`${OID_DIR}/`) && lstatSync(join(cwd, name)).isFile()), deleted };
}

/** Records the verification that just passed, with a hash of every file of the working tree that differs from HEAD, in `.outside-in/checkpoint.json`. */
export function recordCheckpoint(cwd: string, { date, ...details }: CheckpointDetails): void {
  if (spawnSync(GIT, [REV_PARSE, "--verify", "--quiet", HEAD], { cwd }).status !== 0) {
    throw new ProgressError("a checkpoint compares with HEAD: this directory is not a git repository with a commit");
  }
  const { present, deleted } = changesFromHead(cwd);
  const snapshot = Object.fromEntries(present.map((name) => [name, createHash("sha256").update(readFileSync(join(cwd, name))).digest("hex")]));
  mkdirSync(join(cwd, OID_DIR), { recursive: true });
  writeFileAtomic(join(cwd, CHECKPOINT_FILE), `${JSON.stringify({ ...details, date: date.toISOString(), snapshot, deleted }, null, JSON_INDENT)}\n`);
}
