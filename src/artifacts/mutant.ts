import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runGit } from "./checkpoint.js";
import { classifyFailure, type Failure, OUTCOME, RED_CLASS } from "./red-classification.js";
import { NEWLINE } from "./lines.js";

/** A mutant that cannot be applied, with the reason. */
export class MutantError extends Error {}

const OLD_HEADER = "--- ";
const NEW_HEADER = "+++ ";
const NO_FILE = "/dev/null";
const SIDE_PREFIX = /^[ab]\//;
const TAB = "\t";

/** The path a diff header names, without its `a/` or `b/` and without the timestamp some tools append. */
function headerPath(header: string, marker: string): string {
  return header.slice(marker.length).split(TAB)[0]!.replace(SIDE_PREFIX, "");
}

/** The files a diff changes, in the order it names them, each once: a file it creates and a file it deletes included. */
export function mutantFiles(diff: string): string[] {
  const lines = diff.split(NEWLINE);
  const names = lines.flatMap((line, at) => {
    const next = lines[at + 1] ?? "";
    if (!line.startsWith(OLD_HEADER) || !next.startsWith(NEW_HEADER)) return [];
    const created = headerPath(next, NEW_HEADER);
    return [created === NO_FILE ? headerPath(line, OLD_HEADER) : created];
  });
  return [...new Set(names)];
}

/** Puts `bytes` back in `name`, or removes the file when there were none. */
function put(cwd: string, name: string, bytes: Buffer | undefined): void {
  const path = join(cwd, name);
  if (bytes === undefined) {
    rmSync(path, { force: true });
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

/** Runs `run` with the diff applied to the project and puts the files it names back byte for byte afterwards, also when `run` throws; a diff that does not apply is a `MutantError` and `run` does not start. */
export function withMutant<T>(cwd: string, diff: string, run: () => T): T {
  const originals = mutantFiles(diff).map((name) => ({ name, bytes: existsSync(join(cwd, name)) ? readFileSync(join(cwd, name)) : undefined }));
  try {
    if (!runGit(cwd, ["apply", "--whitespace=nowarn", "-"], diff).ok) throw new MutantError("the diff does not apply");
    return run();
  } finally {
    for (const { name, bytes } of originals) put(cwd, name, bytes);
  }
}

/** What the classification says of a name imported from outside the project, which is all a mutant's failure can tell. */
const FROM_OUTSIDE = "external";

/** Whether a run failed on an assertion of the test: the Red classification calls it a business assertion, whatever line it is on; an import error, a missing file, a type error or a failing setup are not. */
export function isAssertionFailure(cwd: string, failure: Failure): boolean {
  const verdict = classifyFailure(failure, { cwd, isSource: () => false, resolveSymbol: () => FROM_OUTSIDE, isOnAddedTestLine: () => true });
  return verdict.outcome === OUTCOME.valid && verdict.class === RED_CLASS.businessAssertion;
}
