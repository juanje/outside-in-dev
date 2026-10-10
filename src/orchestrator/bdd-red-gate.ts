import { existsSync } from "node:fs";
import { hashFile } from "../artifacts/checkpoint.js";
import { loadableStepsProblems } from "../artifacts/loadable-steps.js";
import { NEWLINE } from "../artifacts/lines.js";
import { bddProblems } from "../artifacts/cucumber-report.js";
import { locatePassingScenarios } from "../artifacts/passing-scenarios.js";
import { CYCLE_STEP, loadProgress, type Progress } from "../artifacts/progress.js";
import { listLocatedScenarios, readFeatureSources } from "../artifacts/traceability.js";
import { type ProjectConfig, loadProjectConfig } from "../artifacts/project-config.js";
import { failureDetail, OUTCOME } from "../artifacts/red-classification.js";
import { REAL_RUNNERS, type Runners } from "../artifacts/verify-runner.js";
import { classifyObservation, type Observation, observeBddRun } from "../commands/verify.js";
import { integrityProblems } from "../commands/verify-integrity.js";
import { join } from "node:path";

/** The kind of a result that stops the run. */
export const PROBLEM = "problem";

/** What the gate of BDD Red decided about the steps an agent wrote: a valid Red, a problem that stops the run, or a failure that a person has to classify. */
export type RedGate = { kind: typeof OUTCOME.valid; reason: string; message: string } | { kind: typeof PROBLEM; problem: string } | { kind: typeof OUTCOME.decision; reason: string; message: string; detail?: string };

/** The scenario the steps are written for: its feature file, the line where it starts and its name. */
export type CurrentScenario = { file: string; line: number; name: string };

/** One line for each approved feature file that is not as it was approved. */
function changedFeatures(worktree: string, hashes: Record<string, string>): string[] {
  return Object.entries(hashes)
    .filter(([file, hash]) => !existsSync(join(worktree, file)) || `sha256:${hashFile(worktree, file)}` !== hash)
    .map(([file]) => `${file} changed an approved feature file`);
}

/** The problems that need no run: a change the step does not allow, a feature file that is not as approved, a step file that cannot load. */
function problemsBeforeRun(worktree: string, config: ProjectConfig, progress: Progress, hashes: Record<string, string>): string[] {
  return [...integrityProblems(worktree, config, progress, CYCLE_STEP.bddRed), ...changedFeatures(worktree, hashes), ...loadableStepsProblems(worktree, config)];
}

/** What the Red Gate decides about a run of the test or of the scenario: the class of what it showed, and the failure message as the runner gave it. */
export function redGate(worktree: string, config: ProjectConfig, observation: Observation): RedGate {
  const verdict = classifyObservation(worktree, config, observation);
  const message = "message" in observation.failure ? observation.failure.message : "";
  if (verdict.outcome === OUTCOME.valid) return { kind: OUTCOME.valid, reason: verdict.reason, message };
  if (verdict.outcome === OUTCOME.invalid) return { kind: PROBLEM, problem: `the Red is not valid (${verdict.class}): ${verdict.reason}` };
  const detail = failureDetail(observation.failure);
  return { kind: OUTCOME.decision, reason: verdict.reason, message, ...(detail === "" ? {} : { detail }) };
}

/** Judges the steps an agent wrote for the current scenario: the cheap gates first, then one run of the scenario, classified with the Red Gate that `oid verify red` uses. */
export function bddRedGate(worktree: string, scenario: CurrentScenario, featureHashes: Record<string, string>, runners: Runners = REAL_RUNNERS): RedGate {
  const config = loadProjectConfig(worktree);
  const progress = loadProgress(worktree, config.paths.progress);
  const early = problemsBeforeRun(worktree, config, progress, featureHashes);
  if (early.length > 0) return { kind: PROBLEM, problem: early.join(NEWLINE) };
  const passing = locatePassingScenarios(progress, listLocatedScenarios(readFeatureSources(worktree, config.paths.bdd_features))).found;
  const run = runners.bddScenarios(worktree, config.commands.bdd, [scenario, ...passing]);
  const broken = run.report === undefined ? [] : bddProblems(run.report, passing);
  if (broken.length > 0) return { kind: PROBLEM, problem: ["scenarios that passed no longer pass:", ...broken].join(NEWLINE) };
  return redGate(worktree, config, observeBddRun(worktree, config, scenario, run));
}
