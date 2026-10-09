import { FEATURE_WRITE } from "../agents/profiles.js";
import { names } from "../agents/names.js";
import { featureWritePrompt } from "../agents/prompts/feature-write.js";
import { NEWLINE } from "../artifacts/lines.js";
import { featureWriteContext } from "../agents/context/task-context.js";
import { DONE, runAgent } from "../agents/runner.js";
import { agentContext, outcomeProblem } from "./agent-run.js";
import { announceAgent } from "./attempts.js";
import { PROBLEM } from "./bdd-red-gate.js";
import { runInnerLoop } from "./run-inner-loop.js";
import { featureProblem } from "./feature-gates.js";
import { hashFile } from "../artifacts/checkpoint.js";
import { checkpoint, commitAll } from "../artifacts/git-checkpoints.js";
import { advanceStep, CYCLE_STEP, loadProgress, saveProgress } from "../artifacts/progress.js";
import { parseRequirements } from "../artifacts/spec.js";
import { readText } from "../artifacts/project-json.js";
import { loadProjectConfig } from "../artifacts/project-config.js";
import { acquireLock, releaseLock } from "./lock.js";
import { detectProject } from "../artifacts/detect-all.js";
import { isExitCode, type RunEnvironment, STATE, startOfRun, type Started, transition } from "./begin.js";
import type { RunArgs } from "./run-args.js";
import { updateSession } from "./session.js";
import { ERROR_EVENT, HUMAN_EDIT, WAITING_INPUT } from "../events/types.js";
import { LIST_SEPARATOR } from "../ui/plain.js";
import { type FeatureServices, type ReviewInput, type RunServices, runnersOf, type Terminal } from "./services.js";

/** What the feature writing came to: what stopped it, or the feature files of all the targets. */
type Written = { problem: string } | { files: string[] };

/** Has the feature-writing agent run once for each target feature. */
async function writeFeatures(started: Started, services: FeatureServices, comment?: string): Promise<Written> {
  const { workspace, targets } = started;
  const context = agentContext(started, services);
  const config = loadProjectConfig(workspace.path);
  const knownIds = parseRequirements(readText(workspace.path, config.paths.spec) ?? "").map(({ id }) => id);
  const files: string[] = [];
  for (const fr of targets) {
    const effort = announceAgent(started.bus, { state: FEATURE_WRITE, role: "bdd-agent", models: config.models });
    const outcome = await runAgent({ state: FEATURE_WRITE, prompt: `${featureWritePrompt(fr)}${NEWLINE}${NEWLINE}${featureWriteContext(workspace.path, { fr, comment })}`, model: effort.model, thinkingLevel: effort.thinkingLevel }, context);
    const stopped = outcomeProblem(fr, outcome);
    if (stopped !== undefined) return { problem: stopped };
    if (outcome.status !== DONE || outcome.report.status !== DONE) continue;
    const problem = featureProblem(workspace.path, fr, outcome.report.files, knownIds);
    if (problem !== undefined) return { problem: `${fr}: ${problem}` };
    files.push(...outcome.report.files);
  }
  return { files };
}

const APPROVE = "approve";
const EDIT = "edit";
const REJECT = "reject";
const WORD_SEPARATOR = " ";
const REVIEW_ACTIONS = names(`${APPROVE} ${EDIT} ${REJECT}`).map((key) => ({ key, label: key }));

/** The hash of each file as the session records it. */
function hashesOf(worktree: string, files: string[]): Record<string, string> {
  return Object.fromEntries(files.map((file) => [file, `sha256:${hashFile(worktree, file)}`]));
}

/** Waits for the person to edit the files in the worktree, then commits and logs what changed as a human edit. */
async function acceptHumanEdit({ bus, workspace }: Started, files: string[], input: Terminal): Promise<void> {
  const before = hashesOf(workspace.path, files);
  await input.line(`Edit the feature files in ${workspace.path}, then press enter`);
  const after = hashesOf(workspace.path, files);
  for (const file of files.filter((candidate) => before[candidate] !== after[candidate])) bus.emit({ type: HUMAN_EDIT, file });
  commitAll(workspace, "oid: human edit");
}

/** The question of the review: where the files are and their text. */
function reviewPrompt({ workspace, targets }: Started, files: string[]): string {
  const heading = `Review the feature files of ${targets.join(LIST_SEPARATOR)} in ${workspace.path}`;
  return [heading, ...files.map((file) => `### ${file}\n${readText(workspace.path, file) ?? ""}`)].join("\n\n");
}

/** Moves each target from pending to the step of BDD Red in the progress file of the worktree. */
function moveToBddRed(worktree: string, targets: string[]): void {
  const file = loadProjectConfig(worktree).paths.progress;
  const progress = loadProgress(worktree, file);
  const features = progress.features.map((feature) => (targets.includes(feature.id) ? advanceStep(advanceStep(feature, CYCLE_STEP.select), CYCLE_STEP.bddRed) : feature));
  saveProgress(worktree, { ...progress, features }, file);
}

/** The approval of the feature files: the hash of each, as the session records it. */
type Approval = { approved: Record<string, string> };

/** Approves the feature files: the targets move to BDD Red, the session records the hashes and the run moves on. */
function approve({ cwd, bus, workspace, targets }: Started, files: string[]): Approval {
  moveToBddRed(workspace.path, targets);
  checkpoint(workspace, { fr: targets.join(WORD_SEPARATOR), state: STATE.featureReview });
  const featureHashes = hashesOf(workspace.path, files);
  updateSession(cwd, { state: STATE.bddRed, featureHashes });
  transition(bus, STATE.featureReview, STATE.bddRed, "the feature files are approved; BDD Red is next");
  return { approved: featureHashes };
}

/** The comment of a person who rejects the feature files. */
type Rejection = { comment: string };

/** Asks for the review of the feature files of all the targets at once: returns the exit code the question ends the process with. */
async function askForReview(started: Started, files: string[], input: ReviewInput): Promise<number | Rejection | Approval> {
  if (input.isTTY) {
    const answer = await input.choose(reviewPrompt(started, files), REVIEW_ACTIONS.map(({ key }) => key));
    if (answer === REJECT) return { comment: await input.line("Why are the feature files rejected?") };
    if (answer === EDIT) await acceptHumanEdit(started, files, input);
    else if (answer !== APPROVE) return started.bus.emit({ type: ERROR_EVENT, message: `"${answer}" is not an answer to the review: use ${APPROVE}, ${EDIT} or ${REJECT}` }) ?? 1;
    return approve(started, files);
  }
  const prompt = `Review the feature files of ${started.targets.join(LIST_SEPARATOR)} in ${started.workspace.path}`;
  return started.bus.emit({ type: WAITING_INPUT, request: { id: "feature-review", prompt, actions: REVIEW_ACTIONS } }) ?? 0;
}

/** Runs the states of a run from its start to the review of the feature files, holding the lock until the process ends: returns the exit code of the process. */
export async function runFeatureCycle(cwd: string, args: RunArgs, environment: Omit<RunEnvironment, "pid">, services: RunServices): Promise<number> {
  const { commands } = loadProjectConfig(cwd);
  acquireLock(cwd, services.pid);
  try {
    const started = startOfRun(cwd, args, { ...environment, pid: services.pid }, commands, services.detect ?? detectProject, runnersOf(services));
    if (isExitCode(started)) return started;
    let comment: string | undefined;
    for (;;) {
      const written = await writeFeatures(started, services, comment);
      if (PROBLEM in written) return started.bus.emit({ type: ERROR_EVENT, message: written.problem }) ?? 1;
      transition(started.bus, STATE.featureWrite, STATE.featureReview, "the feature files are written");
      updateSession(cwd, { state: STATE.featureReview });
      const review = await askForReview(started, written.files, services.input ?? { isTTY: false });
      if (isExitCode(review)) return review;
      if ("approved" in review) return runInnerLoop(started, services, review.approved);
      comment = review.comment;
      transition(started.bus, STATE.featureReview, STATE.featureWrite, `the feature files are rejected: ${comment}`);
      updateSession(cwd, { state: STATE.featureWrite });
    }
  } finally {
    releaseLock(cwd);
  }
}
