import { join } from "node:path";
import { FEATURE_WRITE, profileFor } from "../agents/profiles.js";
import { names } from "../agents/names.js";
import { featureWritePrompt } from "../agents/prompts/feature-write.js";
import { NEWLINE } from "../artifacts/lines.js";
import { featureWriteContext } from "../agents/context/task-context.js";
import { BLOCKED, DONE } from "../agents/runner.js";
import { outcomeProblem } from "./agent-run.js";
import { runBillable } from "./budget-call.js";
import { endOnGitFailure } from "./run-git-failure.js";
import { RunStopped } from "./run-stopped.js";
import type { AttemptInfo } from "./attempts.js";
import { Blocked, Redirect, SKIP_FR } from "./redirect.js";
import { attemptsOf, attemptTask } from "./state-attempts.js";
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
import { requireSetup } from "./preflight.js";
import { detectProject } from "../artifacts/detect-all.js";
import { isExitCode, type RunEnvironment, STATE, startOfRun, type Started, transition } from "./begin.js";
import type { RunArgs } from "./run-args.js";
import { readSession, updateSession } from "./session.js";
import { ERROR_EVENT, HUMAN_EDIT, WAITING_INPUT } from "../events/types.js";
import { LIST_SEPARATOR } from "../ui/plain.js";
import { type FeatureServices, type ReviewInput, type RunServices, runnersOf, type Terminal } from "./services.js";

/** A target feature the person skipped while its feature files were written, and why. */
type Skipped = { fr: string; reason: string };

/** What the feature writing came to: what stopped it, or the feature files of the targets that were not skipped and the ones that were. */
type Written = { problem: string } | { files: string[]; skipped: Skipped[] };

/** One attempt of the feature-writing agent for a target feature: the feature files it wrote, or what stopped the run. An agent that is blocked throws `Blocked`. */
async function writeFeature(started: Started, services: FeatureServices, { fr, comment, knownIds }: { fr: string; comment?: string; knownIds: string[] }, info: AttemptInfo): Promise<{ problem: string } | { files: string[] }> {
  const { workspace } = started;
  const profile = profileFor(FEATURE_WRITE, loadProjectConfig(workspace.path));
  const prompt = `${featureWritePrompt(fr, profile)}${NEWLINE}${NEWLINE}${featureWriteContext(workspace.path, { fr, comment })}`;
  const outcome = await runBillable(started, services, attemptTask(FEATURE_WRITE, prompt, info), { fr, announce: info.announce });
  if (outcome.status === BLOCKED) throw new Blocked(outcomeProblem(fr, outcome)!);
  const stopped = outcomeProblem(fr, outcome);
  if (stopped !== undefined) return { problem: stopped };
  if (outcome.status !== DONE || outcome.report.status !== DONE) return { files: [] };
  const problem = featureProblem(workspace.path, fr, outcome.report.files, knownIds);
  return problem === undefined ? { files: outcome.report.files } : { problem: `${fr}: ${problem}` };
}

/** Has the feature-writing agent run once for each target feature. An agent that is blocked is put to the person, who can have it retry with a note, skip the feature or abort. Returns the exit code of the process when the person's answer ends the run. */
async function writeFeatures(started: Started, services: FeatureServices, comment?: string): Promise<Written | number> {
  const { workspace, targets } = started;
  const config = loadProjectConfig(workspace.path);
  const knownIds = parseRequirements(readText(workspace.path, config.paths.spec) ?? "").map(({ id }) => id);
  const files: string[] = [];
  const skipped: Skipped[] = [];
  for (const fr of targets) {
    try {
      const written = await attemptsOf(started, services, { state: FEATURE_WRITE, role: "bdd-agent", label: fr, run: (info) => writeFeature(started, services, { fr, comment, knownIds }, info) });
      if (isExitCode(written)) return written;
      if (PROBLEM in written) return written;
      files.push(...written.files);
    } catch (error) {
      if (!(error instanceof Redirect) || error.action !== SKIP_FR) throw error;
      skipped.push({ fr, reason: error.reason });
    }
  }
  return { files, skipped };
}

const APPROVE = "approve";
const EDIT = "edit";
const REJECT = "reject";
const WORD_SEPARATOR = " ";
const REASON_SEPARATOR = "; ";
const REVIEW_ACTIONS = names(`${APPROVE} ${EDIT} ${REJECT}`).map((key) => ({ key, label: key }));

/** The hash of each file as the session records it. */
function hashesOf(worktree: string, files: string[]): Record<string, string> {
  return Object.fromEntries(files.map((file) => [file, `sha256:${hashFile(worktree, file)}`]));
}

/** Waits for the person to edit the files in the worktree, then commits and logs what changed as a human edit. */
async function acceptHumanEdit({ bus, workspace }: Started, files: string[], input: Terminal): Promise<void> {
  const before = hashesOf(workspace.path, files);
  await input.line(["Edit these feature files, then press enter:", ...files.map((file) => `- ${join(workspace.path, file)}`)].join(NEWLINE));
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

/** Takes the targets the person skipped out of the run and records them in the session: the run without them, and the sentence that says why each was left (empty when none was; otherwise it starts with a separator). */
function leaveSkipped(started: Started, skipped: Skipped[]): { started: Started; reason: string } {
  if (skipped.length === 0) return { started, reason: "" };
  const targets = started.targets.filter((fr) => !skipped.some((skip) => skip.fr === fr));
  updateSession(started.cwd, { targetFrs: targets, leftFrs: [...(readSession(started.cwd)?.leftFrs ?? []), ...skipped.map(({ fr }) => fr)] });
  const reason = skipped.map((skip) => `${skip.fr} is skipped (the person chose skip_fr) and stays pending: ${skip.reason}`).join(REASON_SEPARATOR);
  return { started: { ...started, targets }, reason: `${REASON_SEPARATOR}${reason}` };
}

/** Where the feature writing starts: the comment of a rejection to write them again, or the files already written to review them. */
export type ReviewEntry = { comment?: string; files?: string[] };

/** Has the feature files written and reviewed until they are approved, then runs the inner loop: returns the exit code of the process. A resumed run enters with the files to review again, or with the comment of the rejection. */
export async function writeAndReview(whole: Started, services: FeatureServices, entry: ReviewEntry = {}): Promise<number> {
  let { comment, files } = entry;
  let started = whole;
  for (;;) {
    if (files === undefined) {
      const written = await writeFeatures(started, services, comment);
      if (isExitCode(written)) return written;
      if (PROBLEM in written) return started.bus.emit({ type: ERROR_EVENT, message: written.problem }) ?? 1;
      files = written.files;
      const left = leaveSkipped(started, written.skipped);
      started = left.started;
      if (started.targets.length === 0) {
        updateSession(started.cwd, { state: STATE.done });
        transition(started.bus, STATE.featureWrite, STATE.done, left.reason.slice(REASON_SEPARATOR.length));
        return 0;
      }
      updateSession(started.cwd, { state: STATE.featureReview, featureFiles: files });
      transition(started.bus, STATE.featureWrite, STATE.featureReview, `the feature files are written${left.reason}`);
    }
    const review = await askForReview(started, files, services.input ?? { isTTY: false });
    if (isExitCode(review)) return review;
    if ("approved" in review) return runInnerLoop(started, services, review.approved);
    comment = review.comment;
    files = undefined;
    updateSession(started.cwd, { state: STATE.featureWrite, reviewComment: comment });
    transition(started.bus, STATE.featureReview, STATE.featureWrite, `the feature files are rejected: ${comment}`);
  }
}

/** Runs the states of a run from its start to the review of the feature files, holding the lock until the process ends: returns the exit code of the process. A person's answer that stops the run on the budget ends it with the exit code of the answer. */
export async function runFeatureCycle(cwd: string, args: RunArgs, environment: Omit<RunEnvironment, "pid">, services: RunServices): Promise<number> {
  const { commands } = loadProjectConfig(cwd);
  await requireSetup(cwd, services.preflight);
  acquireLock(cwd, services.pid);
  try {
    const started = startOfRun(cwd, args, { ...environment, pid: services.pid, aborted: services.aborted }, commands, services.detect ?? detectProject, runnersOf(services));
    return isExitCode(started) ? started : await endOnGitFailure(started.bus, () => writeAndReview(started, services));
  } catch (error) {
    if (error instanceof RunStopped) return error.code;
    throw error;
  } finally {
    releaseLock(cwd);
  }
}
