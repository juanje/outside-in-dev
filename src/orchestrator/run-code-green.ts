import { implementationContext } from "../agents/context/task-context.js";
import { CODE_GREEN } from "../agents/profiles.js";
import { codeGreenPrompt } from "../agents/prompts/code-green.js";
import type { AgentTask } from "../agents/runner.js";
import { checkpoint } from "../artifacts/git-checkpoints.js";
import { NEWLINE } from "../artifacts/lines.js";
import { advanceStep, CYCLE_STEP } from "../artifacts/progress.js";
import { runBillable } from "./budget-call.js";
import type { Rejection } from "./attempts.js";
import { type Started, STATE } from "./begin.js";
import { codeGreenGate } from "./code-green-gate.js";
import type { RedScenario } from "./run-bdd-red.js";
import { agentStop, attemptsOf, attemptTask } from "./state-attempts.js";
import { type FeatureServices, runnersOf } from "./services.js";
import type { TddRed } from "./run-tdd-red.js";
import { updateFeature } from "./worktree-progress.js";

/** One attempt of Code Green: the agent writes the minimum code and the gate judges it; a green is checkpointed. Returns the rejection of the attempt, the exit code of the process when the run ends, or nothing when the code is green. */
async function writeCode(started: Started, services: FeatureServices, scenario: RedScenario, task: AgentTask, announce: () => void): Promise<Rejection | number | undefined> {
  const { workspace, targets } = started;
  const [fr] = targets;
  const outcome = await runBillable(started, services, task, { fr: fr!, announce });
  const stopped = agentStop(started, scenario.label, outcome);
  if (stopped !== undefined) return stopped;
  const problems = codeGreenGate(workspace.path, undefined, runnersOf(services));
  if (problems.length > 0) return { rejected: `${scenario.label}: Code Green is not green:${NEWLINE}${problems.join(NEWLINE)}` };
  updateFeature(workspace.path, fr!, (feature) => advanceStep(feature, CYCLE_STEP.tddGreen));
  checkpoint(workspace, { fr: fr!, state: STATE.codeGreen, scenario: scenario.current.name });
  return undefined;
}

/** Runs Code Green for the current scenario, retrying a rejected attempt from the last checkpoint. Returns the exit code of the process when the run ends, nothing when the code is green. */
export async function runCodeGreen(started: Started, services: FeatureServices, scenario: RedScenario, red: TddRed): Promise<number | undefined> {
  const prompt = `${codeGreenPrompt(started.targets[0]!)}${NEWLINE}${NEWLINE}${implementationContext(started.workspace.path, red)}`;
  const result = await attemptsOf(started, services, { state: CODE_GREEN, role: "coder-agent", label: scenario.label, run: (info) => writeCode(started, services, scenario, attemptTask(CODE_GREEN, prompt, info), info.announce) });
  return result ?? undefined;
}
