import { unrecordedScenarios } from "../artifacts/consistency.js";
import { listScenarios, readFeatureSources } from "../artifacts/traceability.js";
import { requireDoneEvidence, requirePassEvidence } from "../artifacts/scenario-evidence.js";
import { hasHead, recordHeadCheckpoint } from "../artifacts/checkpoint.js";
import { clearReturn, recordReturn } from "../artifacts/return-record.js";
import { clearRevise, recordRevise, requireReviseExit } from "../artifacts/revise-record.js";
import { advanceStep, dropScenario, CYCLE_STEP, CYCLE_STEPS, FEATURE_STATUS, SCENARIO_STATUS, SCENARIO_STATUSES, completeFeature, loadProgress, recordScenario, ProgressError, reopenFeature, reviseFeature, saveProgress, requireFeature, type FeatureProgress, type Progress } from "../artifacts/progress.js";
import { loadProjectPaths, type ProjectPaths } from "../artifacts/project-paths.js";
import { readRequirementIds } from "../artifacts/spec.js";
import { commandError, HELP_FLAG, row } from "../cli-usage.js";
import type { CliIo } from "../cli-io.js";

const LIST_SEPARATOR = ", ";

type Context = CliIo & { paths: ProjectPaths };

function summary(feature: FeatureProgress): string {
  const step = feature.cycle_step ? ` ${feature.cycle_step}` : "";
  return `${feature.id}  ${feature.title}  ${feature.status}${step}`;
}

function describe(feature: FeatureProgress): string {
  const scenarios = (feature.scenarios ?? []).map((s) => `  ${s.name}  ${s.bdd}\n`).join("");
  return `${summary(feature)}\n${scenarios}`;
}

function showCurrent(progress: Progress, io: Context): void {
  const focused = progress.features.find((f) => f.id === progress.current_focus);
  io.stdout(focused ? describe(focused) : "No feature is focused\n");
}

function showFeature(progress: Progress, io: Context, id: string | undefined): void {
  io.stdout(describe(requireFeature(progress, id, io.paths.progress)));
}

function addFeature(progress: Progress, io: Context, id: string, title: string): void {
  if (progress.features.some((f) => f.id === id)) {
    throw new ProgressError(`${id} is already tracked in ${io.paths.progress}`);
  }
  if (!readRequirementIds(io.cwd, io.paths.spec).includes(id)) {
    throw new ProgressError(`${id} is not defined in ${io.paths.spec}`);
  }
  progress.features.push({ id, title, status: FEATURE_STATUS.pending });
  saveProgress(io.cwd, progress, io.paths.progress);
}

function focusFeature(progress: Progress, io: Context, id: string): void {
  requireFeature(progress, id, io.paths.progress);
  progress.current_focus = id;
  saveProgress(io.cwd, progress, io.paths.progress);
}

function unfocus(progress: Progress, io: Context): void {
  progress.current_focus = null;
  saveProgress(io.cwd, progress, io.paths.progress);
}

/** Forgets the return and the revise recorded for a feature, which a step or `done` ends. */
function forgetRecords(cwd: string, id: string): void {
  clearReturn(cwd, id);
  clearRevise(cwd, id);
}

/** The steps a feature can go back to `bdd_red` from, which records a return. */
const RETURN_FROM: string[] = [CYCLE_STEP.tddRed, CYCLE_STEP.tddGreen, CYCLE_STEP.refactor, CYCLE_STEP.qualityGate];

function stepFeature(progress: Progress, io: Context, id: string, step: string): void {
  const feature = requireFeature(progress, id, io.paths.progress);
  const reviseExit = feature.cycle_step === CYCLE_STEP.bddRed && step === CYCLE_STEP.qualityGate;
  if (reviseExit) requireReviseExit(io.cwd, io.paths, feature);
  progress.features[progress.features.indexOf(feature)] = advanceStep(feature, step, reviseExit ? [CYCLE_STEP.qualityGate] : []);
  saveProgress(io.cwd, progress, io.paths.progress);
  forgetRecords(io.cwd, id);
  if (step === CYCLE_STEP.bddRed && RETURN_FROM.includes(feature.cycle_step ?? "") && hasHead(io.cwd)) recordReturn(io.cwd, id, feature.cycle_step!);
}

/** The word of `oid progress scenario` that removes a pending scenario instead of recording a status. */
const DROP = "drop";

function recordFeatureScenario(progress: Progress, io: Context, status: string, id: string, name: string): void {
  const feature = requireFeature(progress, id, io.paths.progress);
  if (status === SCENARIO_STATUS.pass) requirePassEvidence(io.cwd, id, name);
  progress.features[progress.features.indexOf(feature)] = status === DROP ? dropScenario(feature, name) : recordScenario(feature, name, status);
  saveProgress(io.cwd, progress, io.paths.progress);
}

function doneFeature(progress: Progress, io: Context, id: string): void {
  const feature = requireFeature(progress, id, io.paths.progress);
  const done = completeFeature(feature);
  const unrecorded = unrecordedScenarios(feature, listScenarios(readFeatureSources(io.cwd, io.paths.features)));
  if (unrecorded.length > 0) {
    throw new ProgressError(`${id} cannot be marked done: scenarios tagged with it are not recorded: ${unrecorded.map((name) => `"${name}"`).join(LIST_SEPARATOR)}`);
  }
  requireDoneEvidence(io.cwd, id, (feature.scenarios ?? []).map(({ name }) => name));
  progress.features[progress.features.indexOf(feature)] = done;
  if (progress.current_focus === id) progress.current_focus = null;
  saveProgress(io.cwd, progress, io.paths.progress);
  forgetRecords(io.cwd, id);
}

function reviseRequirement(progress: Progress, io: Context, id: string): void {
  const feature = requireFeature(progress, id, io.paths.progress);
  const revised = reviseFeature(feature);
  progress.features[progress.features.indexOf(feature)] = revised;
  saveProgress(io.cwd, progress, io.paths.progress);
  clearReturn(io.cwd, id);
  if (revised === feature) {
    io.stdout(`${id}: already at ${CYCLE_STEP.bddRed}\n`);
    return;
  }
  clearRevise(io.cwd, id);
  if (hasHead(io.cwd)) recordRevise(io.cwd, io.paths, revised);
  io.stdout(`${id}: ${CYCLE_STEP.bddRed}, ${revised.scenarios?.length ?? 0} scenarios pending\n`);
}

/** The kind of verification the checkpoint of a reopened feature records, which is not a green. */
const REOPEN_KIND = "reopen";

const NO_FOCUS_FLAG = "--no-focus";

/** Focuses the reopened feature unless asked not to or another feature holds the focus; returns the note for the output. */
function focusReopened(progress: Progress, id: string, keepFocus: boolean): string {
  const held = progress.current_focus;
  if (held !== null && held !== id) return `; focus kept on ${held}`;
  if (!keepFocus) progress.current_focus = id;
  return "";
}

function reopenForReview(progress: Progress, io: Context, id: string, keepFocus: boolean): void {
  const feature = requireFeature(progress, id, io.paths.progress);
  const reopened = reopenFeature(feature);
  progress.features[progress.features.indexOf(feature)] = reopened;
  const focusNote = focusReopened(progress, id, keepFocus);
  saveProgress(io.cwd, progress, io.paths.progress);
  recordHeadCheckpoint(io.cwd, { step: CYCLE_STEP.qualityGate, feature: id, verify: { kind: REOPEN_KIND, target: id }, external: false, date: new Date() });
  io.stdout(`${id}: ${CYCLE_STEP.qualityGate}, ${reopened.scenarios?.length ?? 0} scenarios kept${focusNote}\n`);
}

function showStatus(progress: Progress, io: Context, all: boolean): void {
  const listed = all ? progress.features : progress.features.filter((f) => f.status !== FEATURE_STATUS.done);
  for (const feature of listed) {
    const focus = feature.id === progress.current_focus ? " (focused)" : "";
    io.stdout(`${summary(feature)}${focus}\n`);
  }
  if (!all) io.stdout(`${progress.features.length - listed.length} done\n`);
}

const ID = "FR-xxx";
const ALL_FLAG = "--all";
type SubcommandHelp = {
  summary: string;
  operands: string[];
  options?: Record<string, string>;
  allowed?: { label: string; values: string[] };
};
const SUBCOMMAND_HELP: Record<string, SubcommandHelp> = {
  current: { summary: "Show the focused feature", operands: [] },
  status: {
    summary: "List the features that are not done and count the done ones",
    operands: [],
    options: { [ALL_FLAG]: "List every tracked feature" },
  },
  show: { summary: "Show one feature with its scenarios", operands: [ID] },
  add: { summary: "Track a feature defined in the specification", operands: [ID, '"<title>"'] },
  focus: { summary: "Focus a tracked feature", operands: [ID] },
  step: {
    summary: "Move a feature to its next cycle step",
    operands: [ID, "<cycle_step>"],
    allowed: { label: "Cycle steps", values: CYCLE_STEPS },
  },
  scenario: {
    summary: `Record the status of a scenario, or remove a pending one with ${DROP} instead of a status`,
    operands: ["<pass|fail|pending|drop>", ID, '"<scenario name>"'],
    allowed: { label: "Statuses", values: SCENARIO_STATUSES },
  },
  done: { summary: "Mark a feature done once every scenario passes", operands: [ID] },
  unfocus: { summary: "Clear the focus", operands: [] },
  revise: { summary: "Put a feature back to bdd_red with every scenario pending, when its requirement changed", operands: [ID] },
  reopen: { summary: "Put a done feature back to quality_gate, scenarios unchanged, to address a review", operands: [ID], options: { [NO_FOCUS_FLAG]: "Leave the focus as it is" } },
};
const SUBCOMMANDS = Object.keys(SUBCOMMAND_HELP);

function subcommandUsage(subcommand: string): string {
  const { operands, options = {} } = SUBCOMMAND_HELP[subcommand]!;
  return ["oid progress", subcommand, ...operands, ...Object.keys(options).map((name) => `[${name}]`)].join(" ");
}

function subcommandHelp(subcommand: string): string {
  const { summary, allowed, options = {} } = SUBCOMMAND_HELP[subcommand]!;
  const optionLines = Object.entries(options).map(([name, text]) => row(name, text));
  const flags = optionLines.length > 0 ? `\nOptions:\n${optionLines.join("")}` : "";
  const values = allowed ? `\n${allowed.label}: ${allowed.values.join(", ")}\n` : "";
  return `${summary}\n\nusage: ${subcommandUsage(subcommand)}\n${flags}${values}`;
}

/** The subcommands of `oid progress`, each with its summary and usage, for `oid progress --help`. */
export function progressHelp(): string {
  const entries = SUBCOMMANDS.map((name) => row(name, SUBCOMMAND_HELP[name]!.summary) + row("", subcommandUsage(name)));
  return `\nSubcommands:\n${entries.join("")}`;
}

type Action = (progress: Progress, io: Context, operands: string[]) => void;
/** What each subcommand does once its operands are known to be complete; has the same keys as SUBCOMMAND_HELP. */
const ACTIONS: Record<string, Action> = {
  current: (progress, io) => showCurrent(progress, io),
  status: (progress, io, operands) => showStatus(progress, io, operands.includes(ALL_FLAG)),
  show: (progress, io, [id]) => showFeature(progress, io, id),
  add: (progress, io, [id, title]) => addFeature(progress, io, id!, title!),
  focus: (progress, io, [id]) => focusFeature(progress, io, id!),
  step: (progress, io, [id, step]) => stepFeature(progress, io, id!, step!),
  scenario: (progress, io, [status, id, name]) => recordFeatureScenario(progress, io, status!, id!, name!),
  done: (progress, io, [id]) => doneFeature(progress, io, id!),
  unfocus: (progress, io) => unfocus(progress, io),
  revise: (progress, io, [id]) => reviseRequirement(progress, io, id!),
  reopen: (progress, io, operands) => reopenForReview(progress, io, operands.find((operand) => operand !== NO_FOCUS_FLAG)!, operands.includes(NO_FOCUS_FLAG)),
};

export function runProgress(args: string[], cli: CliIo): void {
  const [command, ...operands] = args;
  if (!SUBCOMMANDS.includes(command!)) {
    throw commandError("subcommand", command, SUBCOMMANDS);
  }
  if (operands.includes(HELP_FLAG)) {
    cli.stdout(subcommandHelp(command));
    return;
  }
  if (operands.length < SUBCOMMAND_HELP[command]!.operands.length) {
    throw new ProgressError(`usage: ${subcommandUsage(command)}`);
  }
  const io: Context = { ...cli, paths: loadProjectPaths(cli.cwd) };
  const progress = loadProgress(io.cwd, io.paths.progress);
  ACTIONS[command]!(progress, io, operands);
}
