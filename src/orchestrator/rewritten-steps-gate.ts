import { withoutCodeSince } from "../artifacts/cycle-code.js";
import { FAILURE, OUTCOME } from "../artifacts/red-classification.js";
import { isInsideSource } from "../artifacts/source-roots.js";
import { REAL_RUNNERS, type Runners } from "../artifacts/verify-runner.js";
import { classifyObservation, failureMessage, type Observation, observeBddRun } from "../commands/verify.js";
import type { ProjectConfig } from "../artifacts/project-config.js";
import { rejection } from "../artifacts/rejection.js";
import { type CurrentScenario, PROBLEM, type RedGate, redGate, runScenarioChecked, scenarioSubject, TRY_AGAIN } from "./bdd-red-gate.js";

/** What the gate decides when the rewritten steps fail with the code written so far: a valid Red or a failure oid cannot classify, both marked `withCode`, or a problem when the run is broken. */
function failsWithCode(worktree: string, config: ProjectConfig, observation: Observation, subject: string): RedGate {
  const gate = redGate(worktree, config, observation, subject);
  if (gate.kind === OUTCOME.valid) return { ...gate, reason: "the rewritten steps fail with the code written so far on an assertion of the scenario: the steps are right and the code is not", withCode: true };
  if (gate.kind === OUTCOME.decision) return { ...gate, withCode: true };
  const next = `fix the steps so that the scenario passes with the code that exists, then ${TRY_AGAIN}`;
  return { kind: PROBLEM, problem: rejection({ failed: "the scenario does not pass with the code written so far", evidence: failureMessage(observation.failure) || subject, next }) };
}

/** Judges the steps an agent wrote again for a scenario whose code exists, the way a return to BDD Red is judged: the cheap gates first, then the scenario must pass with the code written for it since `base` (the commit the scenario started from), and must fail with that code taken out. The code is put back byte for byte, also when a run throws. A scenario that fails without the code is a Red whatever the class of its failure; only a run that shows nothing about the scenario (a broken run) is rejected. Steps that fail with the code on an assertion of the scenario (a valid Red) are accepted at once, marked `withCode`: the steps are right and the code is not, so the code is kept and fixed in TDD Red. A failure with the code that oid cannot classify is returned as a decision, also marked `withCode`, for the person to judge; a Red they accept goes on the same way. */
export function rewrittenStepsGate(worktree: string, scenario: CurrentScenario, featureHashes: Record<string, string>, base: string, runners: Runners = REAL_RUNNERS): RedGate {
  const runs = runScenarioChecked(worktree, scenario, featureHashes, runners);
  if (runs.kind === PROBLEM) return runs;
  const { config } = runs;
  const observation = observeBddRun(worktree, config, scenario, runs.first);
  const { failure } = observation;
  const subject = scenarioSubject(scenario);
  if (failure.kind !== FAILURE.passed) return failsWithCode(worktree, config, observation, subject);
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
