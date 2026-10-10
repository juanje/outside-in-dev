import { dirname, isAbsolute, relative, resolve } from "node:path";
import { NEWLINE } from "./lines.js";
import { isRelativeSpecifier } from "./source-roots.js";

/** The classes of a failing test. The first two make a valid Red. */
export const RED_CLASS = {
  businessAssertion: "business_assertion",
  missingImplementation: "missing_implementation",
  testBug: "test_bug",
  environment: "environment",
} as const;

export type RedClass = (typeof RED_CLASS)[keyof typeof RED_CLASS];

/** What the classification decided: a valid Red, one that is not, or one that a person has to decide. */
export const OUTCOME = { valid: "valid", invalid: "invalid", decision: "decision" } as const;

/** The kinds of observation a run of the test can give. */
export const FAILURE = { passed: "passed", load: "load", error: "error", noTest: "no_test", noScenario: "no_scenario", noReport: "no_report", notRun: "not_run" } as const;

/** What a run of the test showed, from the runner's report. */
export type Failure =
  | { kind: typeof FAILURE.passed }
  | { kind: typeof FAILURE.load; message: string }
  | { kind: typeof FAILURE.error; message: string; step?: string; output?: string }
  | { kind: typeof FAILURE.noTest; name: string; file: string }
  | { kind: typeof FAILURE.noScenario; file: string; line: number }
  | { kind: typeof FAILURE.noReport; runner: "unit" | "BDD"; exitCode: number | null; changedFile?: string }
  | { kind: typeof FAILURE.notRun; status: string; steps?: string[] };

/** What the classification needs to know about the project. */
export interface ClassifyContext {
  cwd: string;
  /** Whether a path, relative to the project, is inside the source paths. */
  isSource: (path: string) => boolean;
  /** Whether a name imported by the test exists in the project module it comes from. */
  resolveSymbol: (name: string) => "exists" | "missing" | "external";
  /** Whether the first stack frame of a failure is a line of a test file added since the last checkpoint. */
  isOnAddedTestLine: (message: string) => boolean;
}

/** The class of a failure: a valid Red, one that is not, or one a person has to decide. */
export type Verdict =
  | { outcome: typeof OUTCOME.valid | typeof OUTCOME.invalid; class: RedClass; reason: string }
  | { outcome: typeof OUTCOME.decision; reason: string; candidate?: RedClass };

/** The text on one line. */
function oneLine(text: string): string {
  return text.split(/\n/).map((line) => line.trim()).join(" ");
}

/** The steps that kept a scenario from running, one on each line; nothing when none is named. */
function stepList(steps: string[]): string {
  return steps.length === 0 ? "" : `, because of these steps:${steps.map((step) => `\n  - ${step}`).join("")}`;
}

/** A module or package the runner could not find: vitest quotes the importer, Node does not. */
const MISSING_MODULE = /Cannot find (?:module|package) '([^']+)' imported from (?:'([^']+)'|(\S+))/;
const NOT_CALLABLE = /^TypeError: (?:\(0 , (\w+)\)|(\w+)) is not a (?:function|constructor)/;

/** A file that failed to load: a syntax error, a module that does not exist yet, a package that is not installed. */
function classifyLoad(message: string, context: ClassifyContext): Verdict {
  const missing = MISSING_MODULE.exec(message);
  if (missing !== null) {
    const [, specifier, quotedImporter, bareImporter] = missing;
    const absolute = isAbsolute(specifier!);
    const path = absolute ? specifier! : resolve(dirname(quotedImporter ?? bareImporter!), specifier!);
    if ((absolute || isRelativeSpecifier(specifier!)) && context.isSource(relative(context.cwd, path))) {
      return { outcome: OUTCOME.valid, class: RED_CLASS.missingImplementation, reason: `the module ${absolute ? relative(context.cwd, path) : specifier} does not exist yet` };
    }
    return { outcome: OUTCOME.invalid, class: RED_CLASS.environment, reason: `${specifier} cannot be found and is not a source module of the project` };
  }
  if (message.startsWith("Transform failed")) {
    return { outcome: OUTCOME.invalid, class: RED_CLASS.testBug, reason: `the test file does not compile: ${oneLine(message)}` };
  }
  return { outcome: OUTCOME.decision, reason: "the test file failed to load" };
}

/** A test that ran and failed. */
function classifyError(message: string, context: ClassifyContext): Verdict {
  if (MISSING_MODULE.test(message)) return classifyLoad(message, context);
  if (message.startsWith("AssertionError")) {
    return context.isOnAddedTestLine(message)
      ? { outcome: OUTCOME.valid, class: RED_CLASS.businessAssertion, reason: "an assertion added since the last checkpoint failed" }
      : { outcome: OUTCOME.decision, reason: "an assertion failed", candidate: RED_CLASS.businessAssertion };
  }
  const notCallable = NOT_CALLABLE.exec(message);
  if (notCallable === null) return { outcome: OUTCOME.decision, reason: "the test failed with an error that is not an assertion" };
  const [, wrapped, bare] = notCallable;
  const name = wrapped ?? bare!;
  const symbol = context.resolveSymbol(name);
  if (symbol === "missing") return { outcome: OUTCOME.valid, class: RED_CLASS.missingImplementation, reason: `${name} does not exist yet` };
  const why = symbol === "exists" ? `${name} exists in the project: the test may use it wrongly` : `${name} is not imported from a project module`;
  return { outcome: OUTCOME.decision, reason: why };
}

/** How many characters of the output a scenario recorded are shown to a person: the last ones. */
export const OUTPUT_LIMIT = 2000;

/** The output a scenario recorded, indented under its heading; only its last `OUTPUT_LIMIT` characters, with a note, when it is longer. */
function outputLines(output: string): string[] {
  if (output === "") return [];
  const cut = output.length > OUTPUT_LIMIT;
  return ["output the scenario recorded:", ...(cut ? ["(earlier output left out)"] : []), ...(cut ? output.slice(-OUTPUT_LIMIT) : output).split(NEWLINE)].map((line, at) => (at === 0 ? line : `  ${line}`));
}

/** What a person needs to judge a failure besides its message: the step that failed and the output the run recorded. */
export function failureDetail(failure: Failure): string {
  if (failure.kind !== FAILURE.error || failure.step === undefined) return "";
  return [`failing step: ${failure.step}`, ...outputLines(failure.output ?? "")].join(NEWLINE);
}

/** Classifies a failure with the deterministic rules of the Red Gate. */
export function classifyFailure(failure: Failure, context: ClassifyContext): Verdict {
  switch (failure.kind) {
    case FAILURE.passed:
      return { outcome: OUTCOME.invalid, class: RED_CLASS.testBug, reason: "the test passes without new implementation" };
    case FAILURE.load:
      return classifyLoad(failure.message, context);
    case FAILURE.error:
      return classifyError(failure.message, context);
    case FAILURE.notRun:
      return { outcome: OUTCOME.invalid, class: RED_CLASS.testBug, reason: `the test did not run (status ${failure.status})${stepList(failure.steps ?? [])}` };
    case FAILURE.noScenario:
      return { outcome: OUTCOME.invalid, class: RED_CLASS.testBug, reason: `no scenario starts at line ${failure.line} of ${failure.file}` };
    case FAILURE.noReport:
      return failure.changedFile === undefined
        ? { outcome: OUTCOME.invalid, class: RED_CLASS.environment, reason: `the ${failure.runner} runner wrote no report (exit code ${failure.exitCode})` }
        : { outcome: OUTCOME.invalid, class: RED_CLASS.testBug, reason: `the ${failure.runner} runner did not start and names ${failure.changedFile}, which changed since the last checkpoint` };
    case FAILURE.noTest:
      return { outcome: OUTCOME.invalid, class: RED_CLASS.testBug, reason: `no test named "${failure.name}" ran in ${failure.file}` };
  }
}
