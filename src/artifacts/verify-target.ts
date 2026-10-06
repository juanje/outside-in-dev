import { ProgressError } from "./progress.js";

const SEPARATOR = " > ";

/** Splits `<test file> > <test name>` at the first separator; the name may contain the separator itself. */
export function parseUnitTarget(target: string): { file: string; name: string } {
  const at = target.indexOf(SEPARATOR);
  if (at < 0) throw new ProgressError(`expected "<test file>${SEPARATOR}<test name>", got "${target}"`);
  return { file: target.slice(0, at), name: target.slice(at + SEPARATOR.length) };
}

const BDD_TARGET = /^(.+\.feature):(\d+)$/;

/** The feature file and the line of a scenario in `<feature>:<line>`; undefined when the target is not of that form. */
export function parseBddTarget(target: string): { file: string; line: number } | undefined {
  const match = BDD_TARGET.exec(target);
  if (match === null) return undefined;
  const [, file, line] = match;
  return { file: file!, line: Number(line) };
}
