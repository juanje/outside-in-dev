import { relative } from "node:path";
import { z } from "zod";
import { ProgressError } from "./progress.js";
import { firstLine } from "./lines.js";
import type { ScenarioLocation } from "./passing-scenarios.js";
import { FAILURE, type Failure } from "./red-classification.js";

const messageSchema = z.object({
  pickle: z.object({ id: z.string(), uri: z.string(), name: z.string(), steps: z.array(z.object({ id: z.string(), text: z.string() })) }).optional(),
  testCase: z.object({ id: z.string(), pickleId: z.string().optional(), testSteps: z.array(z.object({ id: z.string(), pickleStepId: z.string().optional() })) }).optional(),
  testCaseStarted: z.object({ id: z.string(), testCaseId: z.string() }).optional(),
  testStepFinished: z
    .object({ testCaseStartedId: z.string().optional(), testStepId: z.string(), testStepResult: z.object({ status: z.string(), message: z.string().optional() }) })
    .optional(),
});

export interface ScenarioStep {
  /** `PASSED`, `FAILED`, `UNDEFINED`, `PENDING`, `AMBIGUOUS` or `SKIPPED`. */
  status: string;
  /** The failure message of the step; empty when it did not fail. */
  message: string;
}

type Message = z.infer<typeof messageSchema>;
type Pickle = NonNullable<Message["pickle"]>;
type TestCase = NonNullable<Message["testCase"]>;

const PASSED = "PASSED";

/** The messages of a Cucumber Messages report, one JSON document per line. */
function parseMessages(ndjson: string): Message[] {
  const parsed = ndjson
    .split(/\n/)
    .filter((line) => line !== "")
    .map((line) => messageSchema.safeParse(JSON.parse(line)));
  if (parsed.some((line) => !line.success)) throw new ProgressError("the BDD runner wrote a report that is not a Cucumber Messages report");
  return parsed.flatMap((line) => (line.success ? [line.data] : []));
}

/** The steps of the scenarios a Cucumber Messages report holds, in the order they finished; the steps of hooks are left out. */
export function normalizeCucumberReport(ndjson: string): ScenarioStep[] {
  const messages = parseMessages(ndjson);
  const scenarioSteps = new Set(messages.flatMap((message) => message.testCase?.testSteps ?? []).filter((step) => step.pickleStepId !== undefined).map((step) => step.id));
  return messages.flatMap(({ testStepFinished }) =>
    testStepFinished !== undefined && scenarioSteps.has(testStepFinished.testStepId)
      ? [{ status: testStepFinished.testStepResult.status, message: testStepFinished.testStepResult.message ?? "" }]
      : [],
  );
}

/** The statuses of a step that has no working definition: the scenario is not a test yet. */
const NOT_RUN = ["UNDEFINED", "PENDING", "AMBIGUOUS"];

/** What a run of the scenario showed. */
export function observeScenario(steps: ScenarioStep[], target: { file: string; line: number }): Failure {
  if (steps.length === 0) return { kind: FAILURE.noScenario, ...target };
  const unrun = steps.find((step) => NOT_RUN.includes(step.status));
  if (unrun !== undefined) return { kind: FAILURE.notRun, status: unrun.status };
  const failed = steps.find((step) => step.status === "FAILED");
  return failed === undefined ? { kind: FAILURE.passed } : { kind: FAILURE.error, message: failed.message };
}

const STACK_FRAME = /^\s+at .*?\(?(?<path>\/[^():]+):(?<line>\d+):\d+\)?$/m;

/** The file, relative to the project, and the line of the first stack frame of a failure message; undefined when it has none or the file is outside the project. */
export function failingFrame(message: string, cwd: string): { file: string; line: number } | undefined {
  const { path, line } = STACK_FRAME.exec(message)?.groups ?? {};
  const file = path === undefined ? undefined : relative(cwd, path);
  return file === undefined || file.startsWith("..") ? undefined : { file, line: Number(line) };
}

/** The file of the first stack frame of a failure message, relative to the project; undefined when it has none or the file is outside the project. */
export function failingFile(message: string, cwd: string): string | undefined {
  return failingFrame(message, cwd)?.file;
}

const DID_NOT_RUN = "the scenario did not run";

/** How a step that is not one of the scenario's own is named: a hook (Before, After) the run went through. */
const HOOK = "a hook";

/** The first step of the run of a scenario that did not pass, its hooks included, as `step text (what it showed)`; nothing when every step and hook passed. */
function firstStepThatDidNotPass(messages: Message[], pickle: Pickle, testCase: TestCase, run: string): string | undefined {
  const pickleStepOf = new Map(testCase.testSteps.map(({ id, pickleStepId }) => [id, pickleStepId] as const));
  const finished = messages.flatMap(({ testStepFinished }) => (testStepFinished?.testCaseStartedId === run && pickleStepOf.has(testStepFinished.testStepId) ? [testStepFinished] : []));
  const failed = finished.find(({ testStepResult }) => testStepResult.status !== PASSED);
  if (failed === undefined) return undefined;
  const pickleStepId = pickleStepOf.get(failed.testStepId);
  const text = pickleStepId === undefined ? HOOK : (pickle.steps.find(({ id }) => id === pickleStepId)?.text ?? "");
  return `${text} (${firstLine(failed.testStepResult.message ?? failed.testStepResult.status)})`;
}

/** The first step that did not pass in each run of the scenario `name` of the feature file `file`. */
function stepsThatDidNotPass(messages: Message[], { file, name }: { file: string; name: string }): string[] {
  const pickles = messages.flatMap(({ pickle }) => (pickle?.uri === file && pickle.name === name ? [pickle] : []));
  const testCases = messages.flatMap(({ testCase }) => (testCase !== undefined && pickles.some(({ id }) => id === testCase.pickleId) ? [testCase] : []));
  return testCases.flatMap((testCase) => {
    const pickle = pickles.find(({ id }) => id === testCase.pickleId)!;
    const runs = messages.flatMap(({ testCaseStarted }) => (testCaseStarted?.testCaseId === testCase.id ? [testCaseStarted.id] : []));
    return runs.flatMap((run) => firstStepThatDidNotPass(messages, pickle, testCase, run) ?? []);
  });
}

/** One line for each of the scenarios that did not pass in the run, with its first step that did not, and for each that did not run at all. */
export function bddProblems(ndjson: string, scenarios: ScenarioLocation[]): string[] {
  const messages = parseMessages(ndjson);
  return scenarios.flatMap((scenario) => {
    const ran = messages.some(({ pickle }) => pickle?.uri === scenario.file && pickle.name === scenario.name);
    const found = ran ? stepsThatDidNotPass(messages, scenario) : [DID_NOT_RUN];
    return found.map((detail) => `bdd ${scenario.file}:${scenario.line} ${scenario.name}: ${detail}`);
  });
}

/** One line for each scenario of a run that did not pass: its file, its name and the first step that did not. */
export function failedScenarios(ndjson: string): string[] {
  const messages = parseMessages(ndjson);
  return messages.flatMap(({ pickle }) =>
    pickle === undefined ? [] : stepsThatDidNotPass(messages, { file: pickle.uri, name: pickle.name }).map((detail) => `bdd ${pickle.uri}: ${pickle.name}: ${detail}`),
  );
}
