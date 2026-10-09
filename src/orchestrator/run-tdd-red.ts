import { testTaskContext } from "../agents/context/task-context.js";
import { TDD_RED } from "../agents/profiles.js";
import { tddRedPrompt } from "../agents/prompts/tdd-red.js";
import { type AgentTask, DONE } from "../agents/runner.js";
import { checkpoint } from "../artifacts/git-checkpoints.js";
import { NEWLINE } from "../artifacts/lines.js";
import { OUTCOME } from "../artifacts/red-classification.js";
import { parseUnitTarget } from "../artifacts/verify-target.js";
import { runBillable } from "./budget-call.js";
import { isRejection, type Rejection } from "./attempts.js";
import { agentStop, attemptsOf, attemptTask } from "./state-attempts.js";
import { PROBLEM } from "./bdd-red-gate.js";
import { isExitCode, type Started, STATE, transition } from "./begin.js";
import { decideRed, VALID_RED } from "./red-decision.js";
import type { RedScenario } from "./run-bdd-red.js";
import { type FeatureServices, runnersOf } from "./services.js";
import { recordUnitTest, unitTestsOf, updateSession } from "./session.js";
import { unitRedGate } from "./unit-red-gate.js";

/** What TDD Red hands to Code Green: the unit test files to make pass and the failure to get rid of. */
export type TddRed = { tests: string[]; failure: string };

/** The files of some tests, each once. */
const filesOf = (tests: string[]): string[] => [...new Set(tests.map((test) => parseUnitTarget(test).file))];

/** An agent that has no unit logic left while the scenario is still red: the problem is in the integration, and Code Green goes after the failure of the scenario. Accepted only when the scenario has a unit test already. */
function integrationStep(started: Started, scenario: RedScenario): Rejection | TddRed {
  const { cwd, bus } = started;
  const known = unitTestsOf(cwd, scenario.current.name);
  if (known.length === 0) return { rejected: `${scenario.label}: the agent reports that no unit logic is left, but a scenario needs at least one unit test before that` };
  updateSession(cwd, { state: STATE.codeGreen });
  transition(bus, STATE.tddRed, STATE.codeGreen, `integration_step: no unit logic is left and the scenario "${scenario.current.name}" is still red`);
  return { tests: filesOf(known), failure: scenario.failure };
}

/** Judges the unit test the agent wrote, putting a failure oid cannot classify to the person: what the valid Red was and why, or the exit code of the process. */
async function judgeUnitRed(started: Started, services: FeatureServices, names: { label: string; scenario: string }, test: { file: string; name: string }): Promise<number | Rejection | { reason: string; message: string }> {
  const gate = unitRedGate(started.workspace.path, test, runnersOf(services));
  if (gate.kind === PROBLEM) return { rejected: `${names.scenario}: ${gate.problem}` };
  if (gate.kind === OUTCOME.valid) return gate;
  const decided = await decideRed(started.bus, services.input ?? { isTTY: false }, { label: names.label, reason: gate.reason, message: gate.message, subject: "unit test" });
  return decided === VALID_RED ? { reason: "the person decided that it is a valid Red", message: gate.message } : decided;
}

/** One attempt of TDD Red: the agent writes one unit test and the gate judges it; a valid Red is checkpointed and recorded. Returns what Code Green needs, the rejection of the attempt, or the exit code of the process. */
async function writeUnitTest(started: Started, services: FeatureServices, scenario: RedScenario, task: AgentTask, announce: () => void): Promise<number | Rejection | TddRed> {
  const { cwd, bus, workspace, targets } = started;
  const [fr] = targets;
  const { current, label } = scenario;
  const outcome = await runBillable(started, services, task, { fr: fr!, announce });
  const stopped = agentStop(started, label, outcome);
  if (stopped !== undefined) return stopped;
  const report = outcome.status === DONE ? outcome.report : undefined;
  if (report?.status !== DONE) return { rejected: `${label}: the agent ended without a report of a unit test` };
  if ("reason" in report) return integrationStep(started, scenario);
  if (report.test === undefined) return { rejected: `${label}: the report names no unit test` };
  const test = parseUnitTarget(report.test);
  const gate = await judgeUnitRed(started, services, { label: `${label} unit test "${test.name}"`, scenario: label }, test);
  if (isExitCode(gate) || isRejection(gate)) return gate;
  recordUnitTest(cwd, current.name, report.test);
  checkpoint(workspace, { fr: fr!, state: STATE.tddRed, scenario: current.name });
  updateSession(cwd, { state: STATE.codeGreen });
  transition(bus, STATE.tddRed, STATE.codeGreen, `the unit test "${test.name}" fails validly: ${gate.reason}`);
  return { tests: [test.file], failure: gate.message };
}

/** Runs TDD Red for the current scenario, retrying a rejected attempt from the last checkpoint. Returns what Code Green needs, or the exit code of the process. */
export async function runTddRed(started: Started, services: FeatureServices, scenario: RedScenario): Promise<number | TddRed> {
  const { workspace, targets } = started;
  const prompt = `${tddRedPrompt(targets[0]!)}${NEWLINE}${NEWLINE}${testTaskContext(workspace.path, { scenario: scenario.current, failure: scenario.failure })}`;
  return attemptsOf(started, services, { state: TDD_RED, role: "tdd-agent", label: scenario.label, run: (info) => writeUnitTest(started, services, scenario, attemptTask(TDD_RED, prompt, info), info.announce) });
}
