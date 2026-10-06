import { existsSync } from "node:fs";
import { join } from "node:path";
import { recordCheckpoint } from "../artifacts/checkpoint.js";
import { loadProgress, ProgressError } from "../artifacts/progress.js";
import { CONFIG_FILE, parseProjectConfig, type ProjectConfig } from "../artifacts/project-config.js";
import { readJson } from "../artifacts/project-json.js";
import { resolveImportedSymbol } from "../artifacts/project-symbol.js";
import { classifyFailure, FAILURE, type Failure, OUTCOME, RED_CLASS, type RedClass, type Verdict } from "../artifacts/red-classification.js";
import { isInsideSource } from "../artifacts/source-roots.js";
import { runUnitTest } from "../artifacts/verify-runner.js";
import { parseUnitTarget } from "../artifacts/verify-target.js";
import { normalizeVitestReport, selectTest, type UnitFileResult } from "../artifacts/vitest-report.js";
import { commandError } from "../cli-usage.js";
import type { CliIo } from "../cli-io.js";

const RED = "red";
const SUBCOMMANDS = [RED];
const DECIDE_FLAG = "--decide";
const DECISIONS: RedClass[] = [RED_CLASS.businessAssertion, RED_CLASS.missingImplementation, RED_CLASS.testBug, RED_CLASS.environment];
const VALID_RED_CLASSES: RedClass[] = [RED_CLASS.businessAssertion, RED_CLASS.missingImplementation];
const LIST_SEPARATOR = ", ";
const NEWLINE = "\n";
const STACK_FRAME = /^\s+at /;
const DECIDED_OUTSIDE_OID = "decided outside oid";

/** Exit code of a verification that needs a person or an agent to decide the class. */
const NEEDS_A_DECISION = 2;

/** What the run of the test showed: a file that did not load, a test that passed, or a test that failed. */
function observe(files: UnitFileResult[], { file, name }: { file: string; name: string }): Failure {
  const unloaded = files.find((candidate) => candidate.message !== "");
  if (unloaded !== undefined) return { kind: FAILURE.load, message: unloaded.message };
  const selection = selectTest(files, name);
  if (selection.kind === "none") return { kind: FAILURE.noTest, name, file };
  if (selection.kind === "several") {
    throw new ProgressError(`several tests are named "${name}"; give the full name of one of them: ${selection.fullNames.join(LIST_SEPARATOR)}`);
  }
  const { status, failureMessages } = selection.test;
  if (status === "failed") return { kind: FAILURE.error, message: failureMessages[0]! };
  return status === "passed" ? { kind: FAILURE.passed } : { kind: FAILURE.notRun, status };
}

/** The failure message up to the first stack frame, the lines after the first indented. */
function trimFailure(message: string): string {
  const lines = message.split(NEWLINE);
  const end = lines.findIndex((line) => STACK_FRAME.test(line));
  return (end < 0 ? lines : lines.slice(0, end)).join(`${NEWLINE}  `);
}

/** What a person or an agent needs to decide the class of a failure oid cannot classify alone, and how to say it. */
function renderDecision(target: string, message: string, { reason, candidate }: Extract<Verdict, { outcome: typeof OUTCOME.decision }>): string {
  const questions =
    candidate === RED_CLASS.businessAssertion
      ? [
          "  - Is this the assertion of the new behaviour, failing for the right reason?",
          "  - Does the test check something meaningful, not only toBeDefined and not only the absence of something?",
        ]
      : ["  - Does this failure come from behaviour that does not exist yet, rather than from a mistake in the test or in the environment?"];
  return [
    "red: needs a decision",
    `test: ${target}`,
    `failure: ${trimFailure(message)}`,
    `reason: ${reason}`,
    "questions:",
    ...questions,
    `answer with: oid verify red "${target}" ${DECIDE_FLAG} <class>`,
    "  business_assertion, missing_implementation: a valid Red (exit 0)",
    "  test_bug, environment: not a Red (exit 1)",
    "",
  ].join(NEWLINE);
}

/** The test to verify and the class a person or an agent decided, if any. */
function parseArgs(args: string[]): { target: string; decision: RedClass | undefined } {
  const [subcommand, target, ...options] = args;
  if (subcommand !== RED) throw commandError("subcommand", subcommand, SUBCOMMANDS);
  if (target === undefined) throw new ProgressError(`missing test: oid verify red "<test file> > <test name>"`);
  const decideAt = options.indexOf(DECIDE_FLAG);
  const decision = decideAt < 0 ? undefined : options[decideAt + 1];
  if (decision !== undefined && !DECISIONS.includes(decision as RedClass)) {
    throw new ProgressError(`unknown decision ${decision}; valid decisions: ${DECISIONS.join(LIST_SEPARATOR)}`);
  }
  return { target, decision: decision as RedClass | undefined };
}

/** The project configuration; verification runs the commands it holds. */
function loadConfig(cwd: string): ProjectConfig {
  const document = readJson(cwd, CONFIG_FILE);
  if (document === undefined) throw new ProgressError(`${CONFIG_FILE} not found: oid verify runs the commands it holds; run oid init first`);
  return parseProjectConfig(document);
}

/** The class a person or an agent gave to a failure that needed a decision. */
function decided(decision: RedClass): Verdict {
  const outcome = VALID_RED_CLASSES.includes(decision) ? OUTCOME.valid : OUTCOME.invalid;
  return { outcome, class: decision, reason: DECIDED_OUTSIDE_OID };
}

/** Records the checkpoint of a Red that was verified, with the feature in focus. */
function recordRed(cwd: string, config: ProjectConfig, target: string, external: boolean): void {
  const feature = existsSync(join(cwd, config.paths.progress)) ? loadProgress(cwd, config.paths.progress).current_focus : null;
  recordCheckpoint(cwd, { step: "tdd_red", feature, verify: { kind: RED, target }, external, date: new Date() });
}

/** Runs one unit test and says whether it is a valid Red: exit 0 when it is, 1 when it is not, 2 when a decision is needed. */
export function runVerify(io: CliIo, args: string[]): number {
  const { target, decision } = parseArgs(args);
  const test = parseUnitTarget(target);
  const config = loadConfig(io.cwd);
  const { exitCode, report } = runUnitTest(io.cwd, config.commands.unit, test);
  const failure: Failure = report === undefined ? { kind: FAILURE.noReport, exitCode } : observe(normalizeVitestReport(report), test);
  const classified = classifyFailure(failure, {
    cwd: io.cwd,
    isSource: (path) => isInsideSource(config.paths.source, path),
    resolveSymbol: (name) => resolveImportedSymbol(io.cwd, test.file, name),
  });
  if (decision !== undefined && classified.outcome !== OUTCOME.decision) {
    throw new ProgressError(`${DECIDE_FLAG} is refused: this run does not need a decision (${classified.reason})`);
  }
  const verdict = decision === undefined ? classified : decided(decision);
  if (verdict.outcome === OUTCOME.decision) {
    io.stdout(renderDecision(target, "message" in failure ? failure.message : "", verdict));
    return NEEDS_A_DECISION;
  }
  const valid = verdict.outcome === OUTCOME.valid;
  if (valid) recordRed(io.cwd, config, target, decision !== undefined);
  io.stdout(`red: ${valid ? "valid" : "not valid"} (${verdict.class}): ${verdict.reason}\n`);
  return valid ? 0 : 1;
}
