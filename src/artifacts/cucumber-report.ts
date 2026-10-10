import { relative } from "node:path";
import { z } from "zod";
import { ProgressError } from "./progress.js";
import { firstLine, NEWLINE } from "./lines.js";
import type { ScenarioLocation } from "./passing-scenarios.js";
import { FAILURE, type Failure } from "./red-classification.js";

const gherkinStepSchema = z.object({ id: z.string(), keyword: z.string(), keywordType: z.string().optional(), text: z.string(), location: z.object({ line: z.number() }) });
const stepsSchema = z.object({ steps: z.array(gherkinStepSchema) });

interface GherkinChild {
  background?: z.infer<typeof stepsSchema>;
  scenario?: z.infer<typeof stepsSchema>;
  rule?: { children: GherkinChild[] };
}

const childSchema: z.ZodType<GherkinChild> = z.lazy(() =>
  z.object({ background: stepsSchema.optional(), scenario: stepsSchema.optional(), rule: z.object({ children: z.array(childSchema) }).optional() }),
);

const messageSchema = z.object({
  gherkinDocument: z.object({ feature: z.object({ children: z.array(childSchema) }).optional() }).optional(),
  pickle: z
    .object({ id: z.string(), uri: z.string(), name: z.string(), steps: z.array(z.object({ id: z.string(), text: z.string(), astNodeIds: z.array(z.string()).default([]) })) })
    .optional(),
  testCase: z.object({ id: z.string(), pickleId: z.string().optional(), testSteps: z.array(z.object({ id: z.string(), pickleStepId: z.string().optional() })) }).optional(),
  testCaseStarted: z.object({ id: z.string(), testCaseId: z.string() }).optional(),
  attachment: z.object({ testCaseStartedId: z.string().optional(), testStepId: z.string().optional(), body: z.string(), mediaType: z.string() }).optional(),
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

/** The test steps of the scenarios a report holds, or only those of the scenario `only` names, that run a step of the scenario; the steps of hooks are left out. */
function scenarioTestSteps(messages: Message[], only?: { file: string; name: string }): { id: string; pickleStepId?: string }[] {
  const wanted = new Set(messages.flatMap(({ pickle }) => (pickle !== undefined && (only === undefined || (pickle.uri === only.file && pickle.name === only.name)) ? [pickle.id] : [])));
  const testCases = messages.flatMap(({ testCase }) => (testCase !== undefined && (only === undefined || wanted.has(testCase.pickleId ?? "")) ? [testCase] : []));
  return testCases.flatMap(({ testSteps }) => testSteps).filter((step) => step.pickleStepId !== undefined);
}

/** The steps of the scenarios a Cucumber Messages report holds, in the order they finished, or only those of the scenario `only` names; the steps of hooks are left out. */
export function normalizeCucumberReport(ndjson: string, only?: { file: string; name: string }): ScenarioStep[] {
  const messages = parseMessages(ndjson);
  const scenarioSteps = new Set(scenarioTestSteps(messages, only).map((step) => step.id));
  return messages.flatMap(({ testStepFinished }) =>
    testStepFinished !== undefined && scenarioSteps.has(testStepFinished.testStepId)
      ? [{ status: testStepFinished.testStepResult.status, message: testStepFinished.testStepResult.message ?? "" }]
      : [],
  );
}

/** The statuses of a step that has no working definition: the scenario is not a test yet. */
const NOT_RUN = ["UNDEFINED", "PENDING", "AMBIGUOUS"];

/** A step of a Gherkin document, and whether it sets the scenario up. */
type GherkinStep = z.infer<typeof gherkinStepSchema> & { setup: boolean };

/** The kinds Cucumber gives the keyword of a step. */
const KEYWORD_TYPE = { context: "Context", action: "Action", conjunction: "Conjunction" } as const;

/** The English keywords that take the kind of the step before them. */
const CONJUNCTIONS = ["And", "But", "*"];

/** The kind of a step: the one the report gives its keyword, or, when it gives none, the one of the English keyword. */
function keywordType({ keyword, keywordType: given }: z.infer<typeof gherkinStepSchema>): string {
  if (given !== undefined) return given;
  if (CONJUNCTIONS.includes(keyword.trim())) return KEYWORD_TYPE.conjunction;
  return keyword.trim() === "Given" ? KEYWORD_TYPE.context : KEYWORD_TYPE.action;
}

/** The steps with whether each sets the scenario up: a Context step (a Given) does, and a conjunction takes the kind of the step before it. */
function markSetup(steps: z.infer<typeof gherkinStepSchema>[]): GherkinStep[] {
  let setting = false;
  return steps.map((step) => {
    const type = keywordType(step);
    if (type !== KEYWORD_TYPE.conjunction) setting = type === KEYWORD_TYPE.context;
    return { ...step, setup: setting };
  });
}

/** The steps of the Gherkin documents of a report by id. */
function gherkinStepsById(messages: Message[]): Map<string, GherkinStep> {
  const stepsOf = (child: GherkinChild): GherkinStep[] => [...(child.background?.steps ?? []).map((step) => ({ ...step, setup: true })),...markSetup(child.scenario?.steps ?? []), ...(child.rule?.children.flatMap(stepsOf) ?? [])];
  return new Map(messages.flatMap(({ gherkinDocument }) => gherkinDocument?.feature?.children.flatMap(stepsOf) ?? []).map((step) => [step.id, step] as const));
}

/** A test step of the scenarios of a report: how it is named, `file:line Keyword text` (the line and the keyword are left out when the report has no Gherkin document), and whether it sets the scenario up. */
type NamedStep = { name: string; setup: boolean };

/** How a test step of the scenarios of a report is named, and whether it sets the scenario up. */
function stepNamer(messages: Message[], only?: { file: string; name: string }): (testStepId: string) => NamedStep | undefined {
  const gherkin = gherkinStepsById(messages);
  const pickleStepOf = new Map(messages.flatMap(({ pickle }) => pickle?.steps.map((step) => [step.id, { uri: pickle.uri, ...step }] as const) ?? []));
  const pickleStepIdOf = new Map(scenarioTestSteps(messages, only).map(({ id, pickleStepId }) => [id, pickleStepId] as const));
  return (testStepId) => {
    const pickleStep = pickleStepOf.get(pickleStepIdOf.get(testStepId) ?? "");
    if (pickleStep === undefined) return undefined;
    const step = gherkin.get(pickleStep.astNodeIds[0] ?? "");
    return step === undefined
      ? { name: `${pickleStep.uri} ${pickleStep.text}`, setup: false }
      : { name: `${pickleStep.uri}:${step.location.line} ${step.keyword.trim()} ${step.text}`, setup: step.setup };
  };
}

/** One line for each step of the scenario that has no working definition: its name and `(STATUS)`. */
export function unrunSteps(ndjson: string, only?: { file: string; name: string }): string[] {
  const messages = parseMessages(ndjson);
  const namer = stepNamer(messages, only);
  const lines = messages.flatMap(({ testStepFinished }) => {
    const name = namer(testStepFinished?.testStepId ?? "")?.name;
    const status = testStepFinished?.testStepResult.status ?? "";
    return name === undefined || !NOT_RUN.includes(status) ? [] : [`${name} (${status})`];
  });
  return [...new Set(lines)];
}

/** The first step of the scenario that failed, named, and the text its run attached: what the failed step attached, and what hooks or the scenario attached; nothing attached by the steps that passed. */
export function failedStep(ndjson: string, only?: { file: string; name: string }): { step: string; output: string; setup?: true } | undefined {
  const messages = parseMessages(ndjson);
  const namer = stepNamer(messages, only);
  const nameOf = (testStepId: string) => namer(testStepId)?.name;
  const failed = messages.flatMap(({ testStepFinished }) => (testStepFinished?.testStepResult.status === "FAILED" && nameOf(testStepFinished.testStepId) !== undefined ? [testStepFinished] : []))[0];
  if (failed === undefined) return undefined;
  const ofRun = messages.flatMap(({ attachment }) => (attachment !== undefined && attachment.testCaseStartedId === failed.testCaseStartedId && attachment.mediaType.startsWith("text/") ? [attachment] : []));
  const output = ofRun.filter(({ testStepId }) => testStepId === failed.testStepId || nameOf(testStepId ?? "") === undefined).map(({ body }) => body);
  return { step: nameOf(failed.testStepId)!, output: output.join(NEWLINE), ...(namer(failed.testStepId)!.setup ? { setup: true as const } : {}) };
}

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
