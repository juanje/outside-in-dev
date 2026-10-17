import { withoutCodeSince } from "../artifacts/cycle-code.js";
import { FAILURE, OUTCOME } from "../artifacts/red-classification.js";
import { isInsideSource } from "../artifacts/source-roots.js";
import { REAL_RUNNERS, type Runners } from "../artifacts/verify-runner.js";
import { classifyObservation, failureMessage, observeBddRun } from "../commands/verify.js";
import { rejection } from "../artifacts/rejection.js";
import { type CurrentScenario, PROBLEM, type RedGate, runScenarioChecked, scenarioSubject, TRY_AGAIN } from "./bdd-red-gate.js";

/** Judges the steps an agent wrote again for a scenario whose code exists, the way a return to BDD Red is judged: the cheap gates first, then the scenario must pass with the code written for it since `base` (the commit the scenario started from), and must fail with that code taken out. The code is put back byte for byte, also when a run throws. A scenario that fails without the code is a Red whatever the class of its failure; only a run that shows nothing about the scenario (a broken run) is rejected. */
export function rewrittenStepsGate(worktree: string, scenario: CurrentScenario, featureHashes: Record<string, string>, base: string, runners: Runners = REAL_RUNNERS): RedGate {
  const runs = runScenarioChecked(worktree, scenario, featureHashes, runners);
  if (runs.kind === PROBLEM) return runs;
  const { config } = runs;
  const { failure } = observeBddRun(worktree, config, scenario, runs.first);
  const subject = scenarioSubject(scenario);
  if (failure.kind !== FAILURE.passed) {
    return {
      kind: PROBLEM,
      problem: rejection({ failed: "the scenario does not pass with the code written so far", evidence: failureMessage(failure) || subject, next: `fix the steps so that the scenario passes with the code that exists, then ${TRY_AGAIN}` }),
    };
  }
  const without = withoutCodeSince(worktree, base, (name) => isInsideSource(config.paths.source, name), () => {
    const observation = observeBddRun(worktree, config, scenario, runs.again());
    return { observation, verdict: classifyObservation(worktree, config, observation) };
  });
  if (without.observation.failure.kind === FAILURE.passed) {
    const next = `make the steps assert the behaviour that the code of this scenario adds, so that the scenario fails without it; ${TRY_AGAIN}`;
    return { kind: PROBLEM, problem: rejection({ failed: "the scenario passes without the code of this scenario", evidence: `${subject} passed with the code of this scenario taken out`, next }) };
  }
  if (without.verdict.outcome === OUTCOME.invalid) {
    const failed = `the scenario shows nothing without the code of this scenario (${without.verdict.class})`;
    return { kind: PROBLEM, problem: rejection({ failed, evidence: without.verdict.reason, next: `make the scenario fail because the behaviour is missing, not because a step is broken, then ${TRY_AGAIN}` }) };
  }
  return { kind: OUTCOME.valid, reason: "the scenario passes with the code and fails without it", message: failureMessage(without.observation.failure) };
}
