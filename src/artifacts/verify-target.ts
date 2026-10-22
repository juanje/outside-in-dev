import type { ScenarioLocation } from "./passing-scenarios.js";
import { ProgressError } from "./progress.js";
import { type Rejection, rejection } from "./rejection.js";

const LIST_SEPARATOR = ", ";
/** What separates the test file from the test name in a unit target. */
/** The kinds of target `oid verify red` takes: a unit test or a scenario. */
export const TARGET = { test: "unit_test", scenario: "scenario" } as const;

export const UNIT_SEPARATOR = " > ";

/** What joins the titles of a test's full name in the runner's own reports and filters. */
export const WORD_SEPARATOR = " ";

/** Splits `<test file> > <test name>` at the first separator; the name may contain the separator itself. */
export function parseUnitTarget(target: string): { file: string; name: string } {
  const at = target.indexOf(UNIT_SEPARATOR);
  if (at < 0) throw new ProgressError(`expected "<test file>${UNIT_SEPARATOR}<test name>", got "${target}"`);
  return { file: target.slice(0, at), name: target.slice(at + UNIT_SEPARATOR.length) };
}

/** The rejection of a test id that oid cannot run: the id received and the form to send. */
function badUnitTarget(test: string): Rejection {
  return rejection({
    failed: "The report names a test that oid cannot run",
    evidence: `test: "${test}" is not of the form "<test file>${UNIT_SEPARATOR}<test name>"`,
    next: `call report again with test as "<test file>${UNIT_SEPARATOR}<test name>", for example "tests/unit/cart.test.ts${UNIT_SEPARATOR}adds a line"`,
  });
}

/** The file and the name of a unit target with both parts, or the rejection that gives the target received and the form expected. */
export function unitTargetOf(test: string): { file: string; name: string } | Rejection {
  const at = test.indexOf(UNIT_SEPARATOR);
  if (at < 0) return badUnitTarget(test);
  const target = parseUnitTarget(test);
  return target.file.trim() === "" || target.name.trim() === "" ? badUnitTarget(test) : target;
}

const BDD_TARGET =/^(.+\.feature):(\d+)$/;

/** The feature file and the line of a scenario in `<feature>:<line>`; undefined when the target is not of that form. */
export function parseBddTarget(target: string): { file: string; line: number } | undefined {
  const match = BDD_TARGET.exec(target);
  if (match === null) return undefined;
  const [, file, line] = match;
  return { file: file!, line: Number(line) };
}

const FEATURE_FILE = /\.feature$/;
const LEADING_DOT_SLASH = /^\.\//;

/** The scenario of a `<feature file> > <scenario name>` target, when its file is a feature file (it ends in `.feature` or holds located scenarios); refused when that file holds no scenario of that name. */
function scenarioInFile(target: string, located: ScenarioLocation[]): { file: string; line: number } | undefined {
  if (!target.includes(UNIT_SEPARATOR)) return undefined;
  const { file, name } = parseUnitTarget(target);
  const path = file.replace(LEADING_DOT_SLASH, "");
  if (!FEATURE_FILE.test(path) && !located.some((scenario) => scenario.file === path)) return undefined;
  const found = located.find((scenario) => scenario.file === path && scenario.name === name);
  if (found === undefined) throw new ProgressError(`no scenario named "${name}" in ${file}`);
  return { file: found.file, line: found.line };
}

/** The location of the scenario a target names: its `<feature>:<line>`, its name in its feature file, or its exact name when one scenario has it; undefined when it is none of these, refused when several scenarios have the name. */
export function scenarioTarget(target: string, located: ScenarioLocation[]): { file: string; line: number } | undefined {
  const location = parseBddTarget(target) ?? scenarioInFile(target, located);
  if (location !== undefined) return location;
  const named = located.filter(({ name }) => name === target);
  if (named.length > 1) {
    throw new ProgressError(`several scenarios are named "${target}"; give the location of one of them: ${named.map(({ file, line }) => `${file}:${line}`).join(LIST_SEPARATOR)}`);
  }
  return named.length === 0 ? undefined : { file: named[0]!.file, line: named[0]!.line };
}

/** The scenario location itself when a scenario of `located` starts at that line; refused otherwise, as a usage error. */
export function requireScenarioStart(scenario: { file: string; line: number }, located: ScenarioLocation[]): { file: string; line: number } {
  const file = scenario.file.replace(/^\.\//, "");
  if (!located.some((candidate) => candidate.file === file && candidate.line === scenario.line)) {
    throw new ProgressError(`no scenario starts at ${scenario.file}:${scenario.line}`);
  }
  return scenario;
}
