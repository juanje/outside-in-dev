import type { ScenarioLocation } from "./passing-scenarios.js";
import { ProgressError } from "./progress.js";

const LIST_SEPARATOR = ", ";
/** What separates the test file from the test name in a unit target. */
export const UNIT_SEPARATOR = " > ";

/** Splits `<test file> > <test name>` at the first separator; the name may contain the separator itself. */
export function parseUnitTarget(target: string): { file: string; name: string } {
  const at = target.indexOf(UNIT_SEPARATOR);
  if (at < 0) throw new ProgressError(`expected "<test file>${UNIT_SEPARATOR}<test name>", got "${target}"`);
  return { file: target.slice(0, at), name: target.slice(at + UNIT_SEPARATOR.length) };
}

const BDD_TARGET = /^(.+\.feature):(\d+)$/;

/** The feature file and the line of a scenario in `<feature>:<line>`; undefined when the target is not of that form. */
export function parseBddTarget(target: string): { file: string; line: number } | undefined {
  const match = BDD_TARGET.exec(target);
  if (match === null) return undefined;
  const [, file, line] = match;
  return { file: file!, line: Number(line) };
}

/** The location of the scenario a target names: its `<feature>:<line>`, or its exact name when one scenario has it; undefined when it is neither, refused when several scenarios have the name. */
export function scenarioTarget(target: string, located: ScenarioLocation[]): { file: string; line: number } | undefined {
  const location = parseBddTarget(target);
  if (location !== undefined) return location;
  const named = located.filter(({ name }) => name === target);
  if (named.length > 1) {
    throw new ProgressError(`several scenarios are named "${target}"; give the location of one of them: ${named.map(({ file, line }) => `${file}:${line}`).join(LIST_SEPARATOR)}`);
  }
  return named.length === 0 ? undefined : { file: named[0]!.file, line: named[0]!.line };
}
