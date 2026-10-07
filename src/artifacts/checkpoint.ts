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
export const JSON_INDENT = 2;
export const OID_DIR = ".outside-in";
const CHECKPOINT_FILE = `${OID_DIR}/checkpoint.json`;
/** The content of the files of the snapshot, kept to tell later which lines were added since. */
const CHECKPOINT_FILES = `${OID_DIR}/checkpoint-files`;
/** The checkpoint of each feature, and the copies of its files, apart from the single checkpoint of a verification with no feature. */
const CHECKPOINTS_DIR = `${OID_DIR}/checkpoints`;

/** A scenario that a Green ran and that passed: the feature it is tagged with and its name. */
export interface EvidenceScenario {
  feature: string;
  name: string;
}

export interface CheckpointDetails {
  step: string;
  feature: string | null;
  verify: { kind: string; target: string };
  /** Whether a person or an agent outside oid took the decision that the verification rests on. */
  external: boolean;
  /** The scenarios the verification ran and that passed; none for a Red, which is never evidence of pass. */
  scenarios?: EvidenceScenario[];
  date: Date;
}

/** The SHA-256 of a file of the project, as hex. */
export function hashFile(cwd: string, name: string): string {
  return createHash("sha256").update(readFileSync(join(cwd, name))).digest("hex");
}

/** The part of a checkpoint file that comparing with it needs. */
const checkpointSchema = z.object({
  snapshot: z.record(z.string(), z.string()),
  deleted: z.array(z.string()).default([]),
  verify: z.object({ kind: z.string() }).optional(),
  scenarios: z.array(z.object({ feature: z.string(), name: z.string() })).default([]),
});

/** A checkpoint file and the directory with the copies of the files of its snapshot. */
interface CheckpointLocation {
  file: string;
  files: string;
}

/** Where the checkpoint of `feature` is written: its own file, or the single checkpoint for a verification with no feature. */
function checkpointLocation(feature: string | null): CheckpointLocation {
  return feature === null ? { file: CHECKPOINT_FILE, files: CHECKPOINT_FILES } : { file: `${CHECKPOINTS_DIR}/${feature}.json`, files: `${CHECKPOINTS_DIR}/${feature}.files` };
}

/** The checkpoint that judges `feature`: its own; without one, the single checkpoint when that names the feature (as oid wrote it before keeping one per feature); none otherwise. With no feature, the single checkpoint. */
function locateCheckpoint(cwd: string, feature: string | null): CheckpointLocation | undefined {
  const own = checkpointLocation(feature);
  if (feature === null || existsSync(join(cwd, own.file))) return own;
  const single = checkpointLocation(null);
  const named = z.object({ feature: z.string() }).safeParse(readJson(cwd, single.file));
  return named.success && named.data.feature === feature ? single : undefined;
}

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

/** The content of the working tree, as far as comparing with it later needs: the hash of every file that differs from HEAD, and the files deleted since HEAD. */
export interface TreeState {
  snapshot: Record<string, string>;
  deleted: string[];
}

/** Whether the project is a git repository with a commit, which comparing with the working tree needs. */
export function hasHead(cwd: string): boolean {
  return spawnSync(GIT, [REV_PARSE, "--verify", "--quiet", HEAD], { cwd }).status === 0;
}

/** The state of the working tree now, with the files that differ from HEAD and still exist; refused outside a git repository with a commit. */
export function treeState(cwd: string): TreeState & { present: string[] } {
  if (!hasHead(cwd)) {
    throw new ProgressError("a checkpoint compares with HEAD: this directory is not a git repository with a commit");
  }
  const { present, deleted } = changesFromHead(cwd);
  return { present, deleted, snapshot: Object.fromEntries(present.map((name) => [name, hashFile(cwd, name)])) };
}

/** Records the verification that just passed in the checkpoint of its feature (`.outside-in/checkpoints/<id>.json`, or `.outside-in/checkpoint.json` with no feature), with a hash of every file of the working tree that differs from HEAD, and keeps a copy of each of them; the checkpoints of other features are left as they are. */
export function recordCheckpoint(cwd: string, { date, scenarios = [], ...details }: CheckpointDetails): void {
  const { present, deleted, snapshot } = treeState(cwd);
  const { file, files } = checkpointLocation(details.feature);
  rmSync(join(cwd, files), { recursive: true, force: true });
  for (const name of present) {
    mkdirSync(dirname(join(cwd, files, name)), { recursive: true });
    copyFileSync(join(cwd, name), join(cwd, files, name));
  }
  mkdirSync(dirname(join(cwd, file)), { recursive: true });
  writeFileAtomic(join(cwd, file), `${JSON.stringify({ ...details, scenarios, date: date.toISOString(), snapshot, deleted }, null, JSON_INDENT)}\n`);
}

/** What the checkpoint that judges `feature` recorded: the hash of each file that differed from HEAD then, the files deleted then, and where the copies of its files are. Nothing when there is no checkpoint. */
function lastCheckpoint(cwd: string, feature: string | null): z.infer<typeof checkpointSchema> & { files: string | undefined } {
  const location = locateCheckpoint(cwd, feature);
  const parsed = checkpointSchema.safeParse((location && readJson(cwd, location.file)) ?? { snapshot: {} });
  if (!parsed.success) throw new ProgressError(`${location?.file} is not a checkpoint oid wrote: verify again to record a new one`);
  return { ...parsed.data, files: location?.files };
}

/** The kind of verification the checkpoint of `feature` records (undefined when there is none) and the scenarios it ran and that passed. */
export function checkpointEvidence(cwd: string, feature: string | null): { kind: string | undefined; scenarios: EvidenceScenario[] } {
  const { verify, scenarios } = lastCheckpoint(cwd, feature);
  return { kind: verify?.kind, scenarios };
}

/** The state of a file for comparing with a checkpoint: the hash of its content, or `undefined` when it does not exist. */
function currentHash(cwd: string, name: string): string | undefined {
  const path = join(cwd, name);
  return existsSync(path) && lstatSync(path).isFile() ? hashFile(cwd, name) : undefined;
}

/** The files that changed since the checkpoint of `feature` (the single checkpoint with no feature), or since HEAD when there is none: every file whose state is not the one the checkpoint recorded — its hash for a file of the snapshot, absent for a file it recorded as deleted, HEAD's for any other file — including files that went back to HEAD's content and deleted files that came back. */
export function changedSinceCheckpoint(cwd: string, feature: string | null): string[] {
  return changedSince(cwd, lastCheckpoint(cwd, feature));
}

/** The files whose state is not the one `last` recorded: its hash for a file of the snapshot, absent for a file it recorded as deleted, HEAD's for any other file. */
export function changedSince(cwd: string, last: TreeState): string[] {
  const { present, deleted } = changesFromHead(cwd);
  const differsFromHead = new Set([...present, ...deleted]);
  const names = new Set([...present, ...deleted, ...Object.keys(last.snapshot), ...last.deleted]);
  return [...names].filter((name) => {
    if (name in last.snapshot) return currentHash(cwd, name) !== last.snapshot[name];
    if (last.deleted.includes(name)) return currentHash(cwd, name) !== undefined;
    return differsFromHead.has(name);
  });
}

/** The content of `name` as it was at the checkpoint of `feature`, or in HEAD when there is none or the file is not in it; undefined when HEAD has no such file. */
export function baseContent(cwd: string, name: string, feature: string | null): string | undefined {
  const { snapshot, files } = lastCheckpoint(cwd, feature);
  const kept = files === undefined ? undefined : join(cwd, files, name);
  if (name in snapshot && kept !== undefined && existsSync(kept)) return readFileSync(kept).toString();
  const shown = runGit(cwd, ["show", `${HEAD}:${name}`]);
  return shown.ok ? shown.text : undefined;
}
