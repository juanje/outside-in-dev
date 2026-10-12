import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { changedSinceRedBase, changesFromHead, contentAtCommit, redBaseContent } from "./checkpoint.js";

/** The source files of the cycle: those that differ from the last Red checkpoint of `feature`. */
export function cycleCodeFiles(cwd: string, feature: string, isSource: (name: string) => boolean): string[] {
  return changedSinceRedBase(cwd, feature).filter(isSource);
}

/** Writes `content` to `name`, or removes the file when there is none. */
function put(cwd: string, name: string, content: string | Buffer | undefined): void {
  const path = join(cwd, name);
  if (content === undefined) {
    rmSync(path, { force: true });
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/** Runs `run` with `names` as `contentOf` says they were, and puts them back byte for byte afterwards, also when `run` throws. */
function withFilesAs<T>(cwd: string, names: string[], contentOf: (name: string) => string | undefined, run: () => T): T {
  const originals = names.map((name) => ({ name, bytes: existsSync(join(cwd, name)) ? readFileSync(join(cwd, name)) : undefined }));
  try {
    for (const { name } of originals) put(cwd, name, contentOf(name));
    return run();
  } finally {
    for (const { name, bytes } of originals) put(cwd, name, bytes);
  }
}

/** Runs `run` with the source files of the cycle as they were at the last Red checkpoint of `feature`, and puts them back byte for byte afterwards, also when `run` throws. */
export function withoutCycleCode<T>(cwd: string, feature: string, isSource: (name: string) => boolean, run: () => T): T {
  return withFilesAs(cwd, cycleCodeFiles(cwd, feature, isSource), (name) => redBaseContent(cwd, name, feature), run);
}

/** The source files that differ from the commit `base`, committed or not: the code written since then, deleted files included. */
export function codeSince(cwd: string, base: string, isSource: (name: string) => boolean): string[] {
  const { present, deleted } = changesFromHead(cwd, base);
  return [...present, ...deleted].filter(isSource);
}

/** Runs `run` with the source files as they were at the commit `base` (the start of a scenario, say), also for files added or deleted since, and puts them back byte for byte afterwards, also when `run` throws. */
export function withoutCodeSince<T>(cwd: string, base: string, isSource: (name: string) => boolean, run: () => T): T {
  return withFilesAs(cwd, codeSince(cwd, base, isSource), (name) => contentAtCommit(cwd, base, name), run);
}
