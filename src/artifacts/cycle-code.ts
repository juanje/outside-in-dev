import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { changedSinceRedBase, redBaseContent } from "./checkpoint.js";

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

/** Runs `run` with the source files of the cycle as they were at the last Red checkpoint of `feature`, and puts them back byte for byte afterwards, also when `run` throws. */
export function withoutCycleCode<T>(cwd: string, feature: string, isSource: (name: string) => boolean, run: () => T): T {
  const originals = cycleCodeFiles(cwd, feature, isSource).map((name) => ({ name, bytes: existsSync(join(cwd, name)) ? readFileSync(join(cwd, name)) : undefined }));
  try {
    for (const { name } of originals) put(cwd, name, redBaseContent(cwd, name, feature));
    return run();
  } finally {
    for (const { name, bytes } of originals) put(cwd, name, bytes);
  }
}
