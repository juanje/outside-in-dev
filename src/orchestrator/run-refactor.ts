import { refactorPrompt } from "../agents/prompts/refactor.js";
import { REFACTOR } from "../agents/profiles.js";
import { runAgent } from "../agents/runner.js";
import type { Runners } from "../artifacts/verify-runner.js";
import { type Detector, detectProject } from "../artifacts/detect-all.js";
import { type FindingDraft, numberFindings } from "../artifacts/findings.js";
import { checkpoint, rollback } from "../artifacts/git-checkpoints.js";
import { readChangedLines } from "../artifacts/git-changes.js";
import { git, headCommit } from "../artifacts/git-workspace.js";
import { advanceStep, CYCLE_STEP } from "../artifacts/progress.js";
import { loadProjectConfig } from "../artifacts/project-config.js";
import { NEWLINE } from "../artifacts/lines.js";
import { readText } from "../artifacts/project-json.js";
import { agentContext, outcomeProblem } from "./agent-run.js";
import { bddCheck, SCENARIO } from "./bdd-check.js";
import { PROBLEM } from "./bdd-red-gate.js";
import { type Started, STATE, transition } from "./begin.js";
import { codeGreenGate } from "./code-green-gate.js";
import { complexityProblem, findingProblems } from "./refactor-gate.js";
import { newFindings, refactorContext, triage } from "./refactor-findings.js";
import type { Origin } from "./run-bdd-check.js";
import type { RedScenario } from "./run-bdd-red.js";
import { type FeatureServices, runnersOf } from "./services.js";
import { keepPendingFindings, runBaselineFindings, updateSession } from "./session.js";
import { updateFeature } from "./worktree-progress.js";

const REASON_SEPARATOR = "; ";
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const NO_REFACTOR: Origin = { from: STATE.codeGreen, note: "" };

/** The text of a file at HEAD; empty when HEAD does not have the file. */
function committedText(worktree: string, file: string): string {
  return git(worktree, "ls-tree --name-only HEAD --", file) === "" ? "" : git(worktree, "show", `HEAD:${file}`);
}

/** What the refactor is judged against: the findings it must fix, all the findings there were, and the status of the scenario before it. */
type Before = { findings: FindingDraft[]; detected: FindingDraft[]; behaviour: string };

/** What is wrong with the refactor the agent did, cheapest check first; none means it is accepted. */
function refactorProblems(started: Started, detect: Detector, runners: Runners, scenario: RedScenario, before: Before): string[] {
  const worktree = started.workspace.path;
  const early = codeGreenGate(worktree, CYCLE_STEP.refactor, runners);
  if (early.length > 0) return early;
  const found = findingProblems(before.findings, before.detected, detect(worktree));
  if (found.length > 0) return found;
  const touched = [...readChangedLines(worktree).keys()].filter((file) => SOURCE_FILE.test(file));
  const worse = complexityProblem(touched.map((file) => ({ before: committedText(worktree, file), after: readText(worktree, file) ?? "" })));
  if (worse !== undefined) return [worse];
  const check = bddCheck(worktree, scenario.current, "The refactor", runners);
  if (check.kind === PROBLEM) return [check.problem];
  return check.kind === before.behaviour ? [] : [`the scenario "${scenario.current.name}" no longer ${before.behaviour === SCENARIO.pass ? "passes" : "fails as it did"}`];
}

/** Runs REFACTOR (micro) after a Code Green: the detectors look at the lines that Green changed and, when findings remain after triage, an agent fixes exactly that list. The result is accepted only if behaviour is unchanged, the findings are gone, nothing new appears and nothing gets worse; otherwise it is rolled back and its findings wait for the feature refactor. Returns where the BDD Check comes from. */
export async function runRefactor(started: Started, services: FeatureServices, scenario: RedScenario, since: string): Promise<Origin> {
  const { cwd, runId, bus, workspace, targets } = started;
  const worktree = workspace.path;
  const [fr] = targets;
  const detect = services.detect ?? detectProject;
  const detected = detect(worktree);
  const drafts = newFindings(detected, readChangedLines(worktree, since), new Set(runBaselineFindings(cwd, runId)));
  const listed = triage(numberFindings(drafts));
  if (listed.length === 0) return NO_REFACTOR;
  const behaviour = bddCheck(worktree, scenario.current, undefined, runnersOf(services));
  if (behaviour.kind === PROBLEM) return NO_REFACTOR;
  const green = headCommit(worktree);
  updateFeature(worktree, fr!, (feature) => advanceStep(feature, CYCLE_STEP.refactor));
  updateSession(cwd, { state: STATE.refactor });
  transition(bus, STATE.codeGreen, STATE.refactor, `${listed.length} finding${listed.length === 1 ? "" : "s"} on the lines Code Green changed: the agent fixes them`);
  const prompt = `${refactorPrompt(fr!)}${NEWLINE}${NEWLINE}${refactorContext(worktree, listed)}`;
  const outcome = await runAgent({ state: REFACTOR, prompt }, agentContext(started, services));
  const problems = [outcomeProblem(scenario.label, outcome) ?? ""].filter((problem) => problem !== "");
  const rejected = problems.length > 0 ? problems : refactorProblems(started, detect, runnersOf(services), scenario, { findings: drafts, detected, behaviour: behaviour.kind });
  if (rejected.length === 0) {
    checkpoint(workspace, { fr: fr!, state: STATE.refactor, scenario: scenario.current.name });
    return { from: STATE.refactor, note: `accepted: ${listed.length} finding${listed.length === 1 ? "" : "s"} fixed` };
  }
  rollback(workspace, green, loadProjectConfig(worktree).paths.source);
  keepPendingFindings(cwd, runId, listed);
  return { from: STATE.refactor, note: `rolled back: ${rejected.join(REASON_SEPARATOR)}` };
}
