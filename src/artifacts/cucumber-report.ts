import { relative } from "node:path";
import { z } from "zod";
import { ProgressError } from "./progress.js";
import { FAILURE, type Failure } from "./red-classification.js";

const messageSchema = z.object({
  testCase: z.object({ id: z.string(), testSteps: z.array(z.object({ id: z.string(), pickleStepId: z.string().optional() })) }).optional(),
  testStepFinished: z.object({ testStepId: z.string(), testStepResult: z.object({ status: z.string(), message: z.string().optional() }) }).optional(),
});

export interface ScenarioStep {
  /** `PASSED`, `FAILED`, `UNDEFINED`, `PENDING`, `AMBIGUOUS` or `SKIPPED`. */
  status: string;
  /** The failure message of the step; empty when it did not fail. */
  message: string;
}

/** The steps of the scenarios a Cucumber Messages report holds, in the order they finished; the steps of hooks are left out. */
export function normalizeCucumberReport(ndjson: string): ScenarioStep[] {
  const parsed = ndjson
    .split(/\n/)
    .filter((line) => line !== "")
    .map((line) => messageSchema.safeParse(JSON.parse(line)));
  if (parsed.some((line) => !line.success)) throw new ProgressError("the BDD runner wrote a report that is not a Cucumber Messages report");
  const messages = parsed.flatMap((line) => (line.success ? [line.data] : []));
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

const STACK_FRAME_FILE = /^\s+at .*?\(?(\/[^():]+):\d+:\d+\)?$/m;

/** The file of the first stack frame of a failure message, relative to the project; undefined when it has none or the file is outside the project. */
export function failingFile(message: string, cwd: string): string | undefined {
  const absolute = STACK_FRAME_FILE.exec(message)?.[1];
  const path = absolute === undefined ? undefined : relative(cwd, absolute);
  return path === undefined || path.startsWith("..") ? undefined : path;
}
