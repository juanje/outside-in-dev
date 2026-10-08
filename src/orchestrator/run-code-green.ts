import { implementationContext } from "../agents/context/task-context.js";
import { CODE_GREEN } from "../agents/profiles.js";
import { codeGreenPrompt } from "../agents/prompts/code-green.js";
import { runAgent } from "../agents/runner.js";
import { checkpoint } from "../artifacts/git-checkpoints.js";
import { NEWLINE } from "../artifacts/lines.js";
import { advanceStep, CYCLE_STEP } from "../artifacts/progress.js";
import { agentContext, outcomeProblem } from "./agent-run.js";
import { type Started, STATE } from "./begin.js";
import { codeGreenGate } from "./code-green-gate.js";
import { fail, type RedScenario } from "./run-bdd-red.js";
import type { FeatureServices } from "./services.js";
import type { TddRed } from "./run-tdd-red.js";
import { updateFeature } from "./worktree-progress.js";

/** Runs Code Green for the current scenario: the agent writes the minimum code, the gate judges it and a green is checkpointed. Returns the exit code of the process when the run ends, nothing when the code is green. */
export async function runCodeGreen(started: Started, services: FeatureServices, scenario: RedScenario, red: TddRed): Promise<number | undefined> {
  const { workspace, targets } = started;
  const [fr] = targets;
  const prompt = `${codeGreenPrompt(fr!)}${NEWLINE}${NEWLINE}${implementationContext(workspace.path, red)}`;
  const outcome = await runAgent({ state: CODE_GREEN, prompt }, agentContext(started, services));
  const problem = outcomeProblem(scenario.label, outcome);
  if (problem !== undefined) return fail(started, problem);
  const problems = codeGreenGate(workspace.path);
  if (problems.length > 0) return fail(started, `${scenario.label}: Code Green is not green:${NEWLINE}${problems.join(NEWLINE)}`);
  updateFeature(workspace.path, fr!, (feature) => advanceStep(feature, CYCLE_STEP.tddGreen));
  checkpoint(workspace, { fr: fr!, state: STATE.codeGreen, scenario: scenario.current.name });
  return undefined;
}
