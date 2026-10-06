import { ProgressError } from "./progress.js";

const SEPARATOR = " > ";

/** Splits `<test file> > <test name>` at the first separator; the name may contain the separator itself. */
export function parseUnitTarget(target: string): { file: string; name: string } {
  const at = target.indexOf(SEPARATOR);
  if (at < 0) throw new ProgressError(`expected "<test file>${SEPARATOR}<test name>", got "${target}"`);
  return { file: target.slice(0, at), name: target.slice(at + SEPARATOR.length) };
}
