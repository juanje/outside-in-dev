import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runGit } from "./checkpoint.js";
import { classifyFailure, type Failure, OUTCOME, RED_CLASS } from "./red-classification.js";
import { NEWLINE } from "./lines.js";

/** A mutant that cannot be applied, with the reason. */
export class MutantError extends Error {}

const TAB = "\t";
const NUL = "\0";
const NUMSTAT_FIELDS = 3;
const NAME_FIELD = 2;
/** After a numstat record with an empty name, the old and the new name are the next two tokens. */
const OLD_NAME = 1;
const NEW_NAME = 2;
const SOURCE_OF_MOVE = /^(?:rename|copy) from /;

/** The paths git itself says a diff touches (`git apply --numstat -z`), a rename's new path included and a binary patch too; nothing when git rejects the text. */
function numstatPaths(cwd: string, diff: string): string[] {
  const listed = runGit(cwd, ["apply", "--numstat", "-z", "-"], diff);
  if (!listed.ok) return [];
  const tokens = listed.text.split(NUL);
  const names: string[] = [];
  for (let at = 0; at < tokens.length; at++) {
    const fields = tokens[at]!.split(TAB);
    if (fields.length < NUMSTAT_FIELDS) continue;
    const name = fields.slice(NAME_FIELD).join(TAB);
    if (name === "") names.push(tokens[at + OLD_NAME] ?? "", tokens[at + NEW_NAME] ?? "");
    else names.push(name);
  }
  return names.filter((name) => name !== "");
}

/** The files a diff changes, each once: the paths git lists, then the old path of each rename and the source of each copy, which git lists only for the new one. */
export function mutantFiles(diff: string, cwd: string): string[] {
  const moved = diff.split(NEWLINE).filter((line) => SOURCE_OF_MOVE.test(line)).map((line) => line.replace(SOURCE_OF_MOVE, ""));
  return [...new Set([...numstatPaths(cwd, diff), ...moved])];
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
  const originals = mutantFiles(diff, cwd).map((name) => ({ name, bytes: existsSync(join(cwd, name)) ? readFileSync(join(cwd, name)) : undefined }));
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
