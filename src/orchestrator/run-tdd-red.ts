import { testTaskContext } from "../agents/context/task-context.js";
import { TDD_RED } from "../agents/profiles.js";
import { tddRedPrompt } from "../agents/prompts/tdd-red.js";
import { DONE, runAgent } from "../agents/runner.js";
import { checkpoint } from "../artifacts/git-checkpoints.js";
import { NEWLINE } from "../artifacts/lines.js";
import { OUTCOME } from "../artifacts/red-classification.js";
import { parseUnitTarget } from "../artifacts/verify-target.js";
import { agentContext, outcomeProblem } from "./agent-run.js";
import { PROBLEM } from "./bdd-red-gate.js";
import { isExitCode, type Started, STATE, transition } from "./begin.js";
import { decideRed, VALID_RED } from "./red-decision.js";
import { fail, type RedScenario } from "./run-bdd-red.js";
import type { FeatureServices } from "./services.js";
import { recordUnitTest, unitTestsOf, updateSession } from "./session.js";
import { unitRedGate } from "./unit-red-gate.js";

/** What TDD Red hands to Code Green: the unit test files to make pass and the failure to get rid of. */
export type TddRed = { tests: string[]; failure: string };

/** The files of some tests, each once. */
const filesOf = (tests: string[]): string[] => [...new Set(tests.map((test) => parseUnitTarget(test).file))];

/** An agent that has no unit logic left while the scenario is still red: the problem is in the integration, and Code Green goes after the failure of the scenario. Accepted only when the scenario has a unit test already. */
function integrationStep(started: Started, scenario: RedScenario): number | TddRed {
  const { cwd, bus } = started;
  const known = unitTestsOf(cwd, scenario.current.name);
  if (known.length === 0) return fail(started, `${scenario.label}: the agent reports that no unit logic is left, but a scenario needs at least one unit test before that`);
  updateSession(cwd, { state: STATE.codeGreen });
  transition(bus, STATE.tddRed, STATE.codeGreen, `integration_step: no unit logic is left and the scenario "${scenario.current.name}" is still red`);
  return { tests: filesOf(known), failure: scenario.failure };
}

/** Judges the unit test the agent wrote, putting a failure oid cannot classify to the person: what the valid Red was and why, or the exit code of the process. */
async function judgeUnitRed(started: Started, services: FeatureServices, names: { label: string; scenario: string }, test: { file: string; name: string }): Promise<number | { reason: string; message: string }> {
  const gate = unitRedGate(started.workspace.path, test);
  if (gate.kind === PROBLEM) return fail(started, `${names.scenario}: ${gate.problem}`);
  if (gate.kind === OUTCOME.valid) return gate;
  const decided = await decideRed(started.bus, services.input ?? { isTTY: false }, { label: names.label, reason: gate.reason, message: gate.message, subject: "unit test" });
  return decided === VALID_RED ? { reason: "the person decided that it is a valid Red", message: gate.message } : decided;
}

/** Runs TDD Red for the current scenario: the agent writes one unit test, the gate judges it and a valid Red is checkpointed and recorded. Returns what Code Green needs, or the exit code of the process. */
export async function runTddRed(started: Started, services: FeatureServices, scenario: RedScenario): Promise<number | TddRed> {
  const { cwd, bus, workspace, targets } = started;
  const [fr] = targets;
  const { current, label } = scenario;
  const prompt = `${tddRedPrompt(fr!)}${NEWLINE}${NEWLINE}${testTaskContext(workspace.path, { scenario: current, failure: scenario.failure })}`;
  const outcome = await runAgent({ state: TDD_RED, prompt }, agentContext(started, services));
  const problem = outcomeProblem(label, outcome);
  if (problem !== undefined) return fail(started, problem);
  const report = outcome.status === DONE ? outcome.report : undefined;
  if (report?.status !== DONE) return fail(started, `${label}: the agent ended without a report of a unit test`);
  if ("reason" in report) return integrationStep(started, scenario);
  if (report.test === undefined) return fail(started, `${label}: the report names no unit test`);
  const test = parseUnitTarget(report.test);
  const gate = await judgeUnitRed(started, services, { label: `${label} unit test "${test.name}"`, scenario: label }, test);
  if (isExitCode(gate)) return gate;
  recordUnitTest(cwd, current.name, report.test);
  checkpoint(workspace, { fr: fr!, state: STATE.tddRed, scenario: current.name });
  updateSession(cwd, { state: STATE.codeGreen });
  transition(bus, STATE.tddRed, STATE.codeGreen, `the unit test "${test.name}" fails validly: ${gate.reason}`);
  return { tests: [test.file], failure: gate.message };
}
